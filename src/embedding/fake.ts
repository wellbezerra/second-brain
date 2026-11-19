// Deterministic, network-free embedder: the default in every unit test and in CI.

import { createHash } from 'node:crypto';
import { type Embedder, normalize } from './embedder.js';

export const FAKE_DIMENSION = 256;

/**
 * Each word (case- and accent-folded) adds 1 to a dimension chosen by its
 * SHA-256. It understands no meaning, but texts that share words end up close,
 * which is enough to exercise indexing, ranking and the retrieval evals.
 */
export class FakeEmbedder implements Embedder {
  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(FAKE_DIMENSION).fill(0);
      for (const word of words(text)) {
        const slot = createHash('sha256').update(word).digest().readUInt32BE(0) % FAKE_DIMENSION;
        vector[slot] = (vector[slot] ?? 0) + 1;
      }
      return normalize(vector);
    });
  }
}

function words(text: string): string[] {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}
