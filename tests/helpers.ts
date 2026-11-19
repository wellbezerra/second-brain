import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

const created: string[] = [];

/** Diretório temporário removido ao fim de cada teste. */
export function tempDir(prefix = "brain-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop()!, { recursive: true, force: true });
  }
});
