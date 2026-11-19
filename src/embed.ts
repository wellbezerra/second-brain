// Embeddings (ADR 012). The rest of the project depends on `Embedder`, never on a provider.

/** A document is what gets indexed; a query is what gets searched. Some providers embed them differently. */
export type EmbedPurpose = "document" | "query";

export interface Embedder {
  /** "openai", "gemini", "voyage", "ollama" or "hash". */
  readonly provider: string;
  readonly model: string;
  /** Where the texts are sent, readable by the user. */
  readonly endpoint: string;
  /** One unit-norm vector per text, in input order. */
  embed(texts: readonly string[], purpose?: EmbedPurpose): Promise<number[][]>;
  /** "" when everything is fine; otherwise, the problem in Portuguese. */
  health(): Promise<string>;
  /** Dimension, if already known. */
  readonly dim: number | undefined;
  /** Dimension, discovering it with an embedding if needed. */
  dimension(): Promise<number>;
}

export type EmbedErrorKind =
  | "auth"
  | "unreachable"
  | "model-missing"
  | "rate-limit"
  | "timeout"
  | "bad-response"
  | "http";

export class EmbedError extends Error {
  override name = "EmbedError";
  constructor(
    readonly kind: EmbedErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Divides by the norm. A zero-norm vector passes through unchanged. */
export function normalize(vector: readonly number[]): number[] {
  let sum = 0;
  for (const x of vector) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm === 0 ? [...vector] : vector.map((x) => x / norm);
}

/**
 * Non-empty list of finite numbers. `JSON.parse` reads `1e999` as Infinity,
 * and such a vector would become NaN when normalized: it is a malformed response, not a vector.
 */
export function isVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((x) => Number.isFinite(x));
}

/** Ensures all vectors have the same dimension (and the expected one, if already known). */
export function checkDimension(vectors: readonly number[][], known: number | undefined, who: string): number {
  const dim = known ?? vectors[0]!.length;
  if (vectors.some((v) => v.length !== dim)) {
    throw new EmbedError(
      "bad-response",
      `${who} devolveu vetores de dimensões diferentes (esperava ${dim})`,
    );
  }
  return dim;
}
