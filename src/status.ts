import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { BrainIndex, indexPath } from "./db.js";
import type { Counts, IndexIdentity } from "./db.js";
import { scanVault } from "./vault.js";

export interface StatusInput {
  vault: string;
  excludes: readonly string[];
  /** Provider and model from the current configuration, to compare with the index ones. */
  configured: { provider: string; model: string };
}

export interface Status {
  vault: string;
  indexPath: string;
  /** The index file exists. `status` never creates it. */
  exists: boolean;
  /** Who produced the index vectors; `undefined` before the first indexing. */
  identity: IndexIdentity | undefined;
  configured: { provider: string; model: string };
  /** The configuration asks for a provider or model other than the index one. */
  identityMismatch: boolean;
  counts: Counts;
  /** Database plus WAL. */
  sizeBytes: number;
  /** Milliseconds since the epoch. */
  lastIndexAt: number | undefined;
  /**
   * Notes that changed on disk since the last indexing (ADR 009): search
   * answers from the index, not from the disk. "Changed" here means a different
   * mtime or size, which is cheap to measure; hashing is left to `brain index`.
   */
  pending: { new: number; changed: number; removed: number };
  warnings: string[];
}

export function getStatus(input: StatusInput): Status {
  const path = indexPath(input.vault);
  const exists = existsSync(path);
  let identity: IndexIdentity | undefined;
  let counts: Counts = { files: 0, chunks: 0, fts: 0, vec: 0 };
  let lastIndexAt: number | undefined;
  let manifest = new Map<string, { mtime: number; size: number }>();

  if (exists) {
    const index = BrainIndex.open(path);
    try {
      identity = index.identity();
      counts = index.counts();
      const last = index.meta("last_index_at");
      lastIndexAt = last === undefined ? undefined : Number(last);
      manifest = index.manifest();
    } finally {
      index.close();
    }
  }

  const { files, warnings } = scanVault(input.vault, input.excludes);
  const pending = { new: 0, changed: 0, removed: 0 };
  const onDisk = new Set(files);
  for (const file of files) {
    const row = manifest.get(file);
    if (!row) {
      pending.new++;
      continue;
    }
    try {
      const stat = statSync(join(input.vault, ...file.split("/")));
      if (stat.mtimeMs !== row.mtime || stat.size !== row.size) pending.changed++;
    } catch (error) {
      warnings.push(`Não consegui ler ${file}: ${(error as Error).message}`);
    }
  }
  for (const path of manifest.keys()) if (!onDisk.has(path)) pending.removed++;

  return {
    vault: input.vault,
    indexPath: path,
    exists,
    identity,
    configured: input.configured,
    identityMismatch:
      identity !== undefined &&
      (identity.provider !== input.configured.provider || identity.model !== input.configured.model),
    counts,
    sizeBytes: exists ? fileSize(path) + fileSize(`${path}-wal`) : 0,
    lastIndexAt,
    pending,
    warnings,
  };
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
