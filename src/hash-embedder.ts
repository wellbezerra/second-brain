import { createHash } from "node:crypto";
import { normalize } from "./embed.js";
import type { Embedder } from "./embed.js";

const DIM = 64;

/**
 * Embedder determinístico e sem rede, para testes. Cada palavra (sem caixa e
 * sem acento) soma 1 numa dimensão escolhida pelo SHA-256 dela. Não entende
 * significado, mas textos com palavras em comum ficam próximos.
 *
 * O algoritmo é fixado por um teste com vetor de referência: mudá-lo é
 * mudança deliberada.
 */
export class HashEmbedder implements Embedder {
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
