import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/config.js";
import { BrainIndex, indexPath } from "../src/db.js";
import { getStatus } from "../src/status.js";
import { tempDir } from "./helpers.js";

const IDENTITY = { provider: "hash", model: "hash-64", dim: 64 };
const configured = { provider: "hash", model: "hash-64" };

function vault() {
  const root = tempDir();
  writeFileSync(join(root, "a.md"), "nota a");
  mkdirSync(join(root, "pasta"));
  writeFileSync(join(root, "pasta", "b.md"), "nota b");
  return root;
}

/** Grava no manifesto o estado atual do disco, como uma indexação faria. */
function indexAsOnDisk(root: string, paths: string[]) {
  const index = BrainIndex.open(indexPath(root), IDENTITY);
  for (const path of paths) {
    const stat = statSync(join(root, ...path.split("/")));
    index.upsertFile({ path, hash: "h", mtime: stat.mtimeMs, size: stat.size, title: path });
  }
  index.setMeta("last_index_at", "1700000000000");
  index.close();
}

const status = (root: string, conf = configured) =>
  getStatus({ vault: root, excludes: DEFAULTS.excludes, configured: conf });

describe("getStatus", () => {
  it("sem índice: não cria arquivo e conta tudo como novo", () => {
    const root = vault();
    const s = status(root);
    expect(s.exists).toBe(false);
    expect(s.counts).toEqual({ files: 0, chunks: 0, fts: 0, vec: 0 });
    expect(s.pending).toEqual({ new: 2, changed: 0, removed: 0 });
    expect(s.lastIndexAt).toBeUndefined();
    expect(() => statSync(indexPath(root))).toThrow();
  });

  it("índice recém-criado e vazio funciona", () => {
    const root = vault();
    BrainIndex.open(indexPath(root)).close();
    const s = status(root);
    expect(s.exists).toBe(true);
    expect(s.identity).toBeUndefined();
    expect(s.sizeBytes).toBeGreaterThan(0);
  });

  it("em dia com o disco: nada pendente", () => {
    const root = vault();
    indexAsOnDisk(root, ["a.md", "pasta/b.md"]);
    const s = status(root);
    expect(s.pending).toEqual({ new: 0, changed: 0, removed: 0 });
    expect(s.counts.files).toBe(2);
    expect(s.identity).toEqual(IDENTITY);
    expect(s.lastIndexAt).toBe(1_700_000_000_000);
    expect(s.identityMismatch).toBe(false);
  });

  it("conta notas novas, alteradas e removidas desde a última indexação", () => {
    const root = vault();
    indexAsOnDisk(root, ["a.md", "pasta/b.md"]);
    writeFileSync(join(root, "c.md"), "nova");
    writeFileSync(join(root, "a.md"), "nota a, agora maior");
    rmSync(join(root, "pasta", "b.md"));
    expect(status(root).pending).toEqual({ new: 1, changed: 1, removed: 1 });
  });

  it("mtime diferente com mesmo tamanho conta como alterada", () => {
    const root = vault();
    indexAsOnDisk(root, ["a.md", "pasta/b.md"]);
    const future = new Date(Date.now() + 60_000);
    utimesSync(join(root, "a.md"), future, future);
    expect(status(root).pending.changed).toBe(1);
  });

  it("aponta quando a configuração usa outro provedor ou modelo que o índice", () => {
    const root = vault();
    indexAsOnDisk(root, ["a.md"]);
    expect(status(root, { provider: "openai", model: "text-embedding-3-small" }).identityMismatch).toBe(true);
  });
});
