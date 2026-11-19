import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { BrainIndex, indexPath } from "./db.js";
import type { Counts, IndexIdentity } from "./db.js";
import { scanVault } from "./vault.js";

export interface StatusInput {
  vault: string;
  excludes: readonly string[];
  /** Provedor e modelo da configuração atual, para comparar com os do índice. */
  configured: { provider: string; model: string };
}

export interface Status {
  vault: string;
  indexPath: string;
  /** O arquivo de índice existe. `status` nunca o cria. */
  exists: boolean;
  /** Quem gerou os vetores do índice; `undefined` antes da primeira indexação. */
  identity: IndexIdentity | undefined;
  configured: { provider: string; model: string };
  /** A configuração pede outro provedor ou modelo que o do índice. */
  identityMismatch: boolean;
  counts: Counts;
  /** Banco mais WAL. */
  sizeBytes: number;
  /** Milissegundos desde a época. */
  lastIndexAt: number | undefined;
  /**
   * Notas que mudaram no disco desde a última indexação (ADR 009): a busca
   * responde pelo índice, não pelo disco. "Alterada" aqui é mtime ou
   * tamanho diferente — barato de medir; o hash fica para o `brain index`.
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
