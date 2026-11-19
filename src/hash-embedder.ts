import { createHash } from "node:crypto";
import { normalize } from "./embed.js";
import type { Embedder } from "./embed.js";

const DIM = 64;

/**
 * Deterministic, network-free embedder for tests. Each word (case- and
 * accent-folded) adds 1 to a dimension chosen by its SHA-256. It does not
 * understand meaning, but texts sharing words end up close.
 *
 * The algorithm is pinned by a test with a reference vector: changing it is
 * a deliberate change.
 */
export class HashEmbedder implements Embedder {
  readonly provider = "hash";
  readonly model = `hash-${DIM}`;
  readonly endpoint = "local";
  readonly dim = DIM;

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(DIM).fill(0);
      for (const token of tokens(text)) {
        const index = createHash("sha256").update(token).digest().readUInt32BE(0) % DIM;
        vector[index]! += 1;
      }
      return normalize(vector);
    });
  }

  async health(): Promise<string> {
    return "";
  }

  async dimension(): Promise<number> {
    return DIM;
  }
}

function tokens(text: string): string[] {
  const folded = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}
