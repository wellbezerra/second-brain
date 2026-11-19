import { describe, expect, it } from "vitest";
import { HashEmbedder } from "../src/hash-embedder.js";

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe("HashEmbedder", () => {
  const embedder = new HashEmbedder();

  it("tem dimensão 64 e saúde sempre boa", async () => {
    expect(embedder.provider).toBe("hash");
    expect(embedder.endpoint).toBe("local");
    expect(embedder.dim).toBe(64);
    expect(await embedder.dimension()).toBe(64);
    expect(await embedder.health()).toBe("");
  });

  it("dá sempre o mesmo vetor para o mesmo texto, em qualquer processo", async () => {
    // Valor fixo: se mudar, mudou o algoritmo, e índices de teste antigos deixam de valer.
    const [v] = await embedder.embed(["Vetorização local com Ollama, vetorização!"]);
    const expected = new Array(64).fill(0);
    expected[26] = expected[35] = expected[63] = 1 / Math.sqrt(7);
    expected[36] = 2 / Math.sqrt(7);
    for (let i = 0; i < 64; i++) expect(v![i]).toBeCloseTo(expected[i], 12);
  });

  it("ignora caixa e acentos", async () => {
    const [a, b] = await embedder.embed(["Vetorização", "vetorizacao"]);
    expect(a).toEqual(b);
  });

  it("textos com palavras em comum ficam mais próximos", async () => {
    const [q, near, far] = await embedder.embed([
      "busca híbrida com sqlite",
      "a busca híbrida usa sqlite e fts5",
      "receita de bolo de cenoura",
    ]);
    expect(cosine(q!, near!)).toBeGreaterThan(cosine(q!, far!));
  });

  it("normaliza, e texto sem palavras vira vetor zero", async () => {
    const [v, zero] = await embedder.embed(["um texto qualquer", "!!! ..."]);
    expect(Math.hypot(...v!)).toBeCloseTo(1, 9);
    expect(zero).toEqual(new Array(64).fill(0));
  });

  it("embed([]) devolve []", async () => {
    expect(await embedder.embed([])).toEqual([]);
  });
});
