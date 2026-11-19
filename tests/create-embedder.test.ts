import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULTS } from "../src/config.js";
import type { ProviderName, Settings } from "../src/config.js";
import { EmbedError } from "../src/embed.js";
import { createEmbedder } from "../src/embedders/index.js";
import { GeminiEmbedder } from "../src/embedders/gemini.js";
import { OllamaEmbedder } from "../src/embedders/ollama.js";
import { OpenAIEmbedder } from "../src/embedders/openai.js";
import { VoyageEmbedder } from "../src/embedders/voyage.js";
import { fakeFetch, json } from "./fake-fetch.js";

const settings = (provider: ProviderName, model: string): Settings => ({
  ...DEFAULTS,
  excludes: [...DEFAULTS.excludes],
  provider,
  model,
});

describe("createEmbedder", () => {
  it.each([
    ["openai", "text-embedding-3-small", OpenAIEmbedder],
    ["gemini", "gemini-embedding-2", GeminiEmbedder],
    ["voyage", "voyage-4", VoyageEmbedder],
    ["ollama", "bge-m3", OllamaEmbedder],
  ] as const)("%s cria o cliente certo com o modelo da configuração", (provider, model, Class) => {
    const embedder = createEmbedder(settings(provider, model), {});
    expect(embedder).toBeInstanceOf(Class);
    expect(embedder.provider).toBe(provider);
    expect(embedder.model).toBe(model);
  });

  it("lê a chave do ambiente", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      json({ data: (call.body!.input as string[]).map((_, index) => ({ index, embedding: [1, 0] })) }),
    );
    const embedder = createEmbedder(settings("openai", "text-embedding-3-small"), { OPENAI_API_KEY: "sk-amb" }, fetch);
    await embedder.embed(["x"]);
    expect(calls[0]!.headers.authorization).toBe("Bearer sk-amb");
  });

  it("Gemini aceita GOOGLE_API_KEY como alternativa", async () => {
    const { fetch, calls } = fakeFetch(() => json({ embeddings: [{ values: [1, 0] }] }));
    const embedder = createEmbedder(settings("gemini", "gemini-embedding-2"), { GOOGLE_API_KEY: "g-1" }, fetch);
    await embedder.embed(["x"]);
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("g-1");
  });

  it("Voyage usa VOYAGE_BASE_URL quando definido", async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: [{ index: 0, embedding: [1, 0] }] }));
    const embedder = createEmbedder(
      settings("voyage", "voyage-4"),
      { VOYAGE_API_KEY: "v-1", VOYAGE_BASE_URL: "https://api.voyageai.com/v1" },
      fetch,
    );
    await embedder.embed(["x"]);
    expect(calls[0]!.url.host).toBe("api.voyageai.com");
  });

  it.each(["nao-e-url", "ftp://api.voyageai.com/v1", "file:///etc/passwd"])(
    "VOYAGE_BASE_URL inválida (%s) é ConfigError orientado, não TypeError",
    (url) => {
      const create = () => createEmbedder(settings("voyage", "voyage-4"), { VOYAGE_API_KEY: "v-1", VOYAGE_BASE_URL: url });
      expect(create).toThrow(ConfigError);
      expect(create).toThrow(/VOYAGE_BASE_URL/);
      expect(create).not.toThrow(/v-1/);
    },
  );

  it("Ollama usa ollama_url da configuração", () => {
    const embedder = createEmbedder({ ...settings("ollama", "bge-m3"), ollamaUrl: "http://outra:1" }, {});
    expect(embedder.endpoint).toContain("http://outra:1");
  });

  it("chave vazia conta como ausente", async () => {
    const embedder = createEmbedder(settings("openai", "text-embedding-3-small"), { OPENAI_API_KEY: "  " });
    await expect(embedder.embed(["x"])).rejects.toBeInstanceOf(EmbedError);
  });
});
