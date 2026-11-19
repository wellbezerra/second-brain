// The embedding contract. Everything else depends on this, never on a provider.

export interface Embedder {
  /** One unit-length vector per text, in input order. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** Scales a vector to unit length; a zero vector is returned unchanged. */
export function normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? [...vector] : vector.map((x) => x / norm);
}
