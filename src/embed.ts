// Embeddings (ADR 012). O resto do projeto depende de `Embedder`, nunca de um provedor.

/** Documento é o que se indexa; consulta é o que se busca. Alguns provedores embeddam diferente. */
export type EmbedPurpose = "document" | "query";

export interface Embedder {
  /** "openai", "gemini", "voyage", "ollama" ou "hash". */
  readonly provider: string;
  readonly model: string;
  /** Para onde os textos vão, legível para o usuário. */
  readonly endpoint: string;
  /** Um vetor de norma 1 por texto, na ordem de entrada. */
  embed(texts: readonly string[], purpose?: EmbedPurpose): Promise<number[][]>;
  /** "" quando está tudo certo; senão, o problema em português. */
  health(): Promise<string>;
  /** Dimensão, se já conhecida. */
  readonly dim: number | undefined;
  /** Dimensão, descobrindo-a com um embedding se preciso. */
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

/** Divide pela norma. Vetor de norma zero passa sem alteração. */
export function normalize(vector: readonly number[]): number[] {
  let sum = 0;
  for (const x of vector) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm === 0 ? [...vector] : vector.map((x) => x / norm);
}

/**
 * Lista não vazia de números finitos. `JSON.parse` lê `1e999` como Infinity,
 * e um vetor assim viraria NaN ao normalizar: é resposta defeituosa, não vetor.
 */
export function isVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((x) => Number.isFinite(x));
}

/** Garante que todos os vetores têm a mesma dimensão (e a esperada, se já conhecida). */
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
