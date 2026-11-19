import { describe, expect, it } from "vitest";
import { EmbedError, normalize } from "../src/embed.js";
import type { EmbedPurpose, Embedder } from "../src/embed.js";
import { GeminiEmbedder } from "../src/embedders/gemini.js";
import { OpenAIEmbedder } from "../src/embedders/openai.js";
import { VoyageEmbedder } from "../src/embedders/voyage.js";
import { fakeFetch, json, networkDown, vectorFor } from "./fake-fetch.js";
import type { Call, Handler } from "./fake-fetch.js";

const KEY = "sk-segredo-1234567890";
const noSleep = async () => {};

/** What changes from one provider to another, to run the same tests on all three. */
interface Provider {
  name: string;
  label: string;
  keyVar: string;
  host: string;
  defaultModel: string;
  make(options: { apiKey: string | undefined; fetch: typeof globalThis.fetch; model?: string }): Embedder;
  /** Texts sent in a call, with prefixes stripped. */
  inputs(call: Call): string[];
  /** Success response for the texts of a call. */
  ok(call: Call): Response;
  /** Error response in the provider's format. */
  error(status: number, message: string): Response;
  /** Header that carries the key. */
  keyHeader(call: Call): string | undefined;
}

const openai: Provider = {
  name: "openai",
  label: "a OpenAI",
  keyVar: "OPENAI_API_KEY",
  host: "api.openai.com",
  defaultModel: "text-embedding-3-small",
  make: ({ apiKey, fetch, model }) =>
    new OpenAIEmbedder({ apiKey, fetch, sleep: noSleep, ...(model ? { model } : {}) }),
  inputs: (call) => call.body!.input as string[],
  ok: (call) => {
    const input = call.body!.input as string[];
    // OpenAI returns items with `index`; list order is not guaranteed.
    const data = input.map((t, index) => ({ object: "embedding", index, embedding: vectorFor(t) }));
    return json({ object: "list", data: data.reverse(), model: call.body!.model });
  },
  error: (status, message) => json({ error: { message, type: "invalid_request_error" } }, status),
  keyHeader: (call) => call.headers.authorization,
};

const strip = (text: string) => text.replace(/^(task: search result \| query: |title: none \| text: )/, "");

const gemini: Provider = {
  name: "gemini",
  label: "o Gemini",
  keyVar: "GEMINI_API_KEY",
  host: "generativelanguage.googleapis.com",
  defaultModel: "gemini-embedding-2",
  make: ({ apiKey, fetch, model }) =>
    new GeminiEmbedder({ apiKey, fetch, sleep: noSleep, ...(model ? { model } : {}) }),
  inputs: (call) =>
    (call.body!.requests as { content: { parts: { text: string }[] } }[]).map((r) =>
      strip(r.content.parts[0]!.text),
    ),
  ok: (call) =>
    json({ embeddings: gemini.inputs(call).map((t) => ({ values: vectorFor(t) })) }),
  error: (status, message) =>
    json({ error: { code: status, message, status: status === 404 ? "NOT_FOUND" : "INVALID_ARGUMENT" } }, status),
  keyHeader: (call) => call.headers["x-goog-api-key"],
};

const voyage: Provider = {
  name: "voyage",
  label: "a Voyage",
  keyVar: "VOYAGE_API_KEY",
  host: "ai.mongodb.com",
  defaultModel: "voyage-4",
  make: ({ apiKey, fetch, model }) =>
    new VoyageEmbedder({ apiKey, fetch, sleep: noSleep, ...(model ? { model } : {}) }),
  inputs: (call) => call.body!.input as string[],
  ok: (call) =>
    json({
      object: "list",
      data: (call.body!.input as string[]).map((t, index) => ({ object: "embedding", index, embedding: vectorFor(t) })),
      model: call.body!.model,
    }),
  error: (status, message) => json({ detail: message }, status),
  keyHeader: (call) => call.headers.authorization,
};

describe.each([openai, gemini, voyage])("$name", (p) => {
  const setup = (handler: Handler = (call) => p.ok(call), model?: string) => {
    const { fetch, calls } = fakeFetch(handler);
    return { embedder: p.make({ apiKey: KEY, fetch, ...(model ? { model } : {}) }), calls };
  };

  it("identifica provedor, modelo padrão e destino", () => {
    const { embedder } = setup();
    expect(embedder.provider).toBe(p.name);
    expect(embedder.model).toBe(p.defaultModel);
    expect(embedder.endpoint).toContain(p.host);
  });

  it("embed([]) devolve [] sem chamar a rede", async () => {
    const { embedder, calls } = setup();
    expect(await embedder.embed([])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("devolve vetores normalizados, na ordem de entrada, com a chave no cabeçalho", async () => {
    const { embedder, calls } = setup();
    const texts = ["a", "bbb", "cc"];
    expect(await embedder.embed(texts)).toEqual(texts.map((t) => normalize(vectorFor(t))));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.host).toBe(p.host);
    expect(p.keyHeader(calls[0]!)).toContain(KEY);
    expect(p.inputs(calls[0]!)).toEqual(texts);
  });

  it("divide lotes grandes e mantém a ordem", async () => {
    const { embedder, calls } = setup();
    const texts = Array.from({ length: 250 }, (_, i) => "t".repeat(i + 1));
    expect(await embedder.embed(texts)).toEqual(texts.map((t) => normalize(vectorFor(t))));
    expect(calls.map((c) => p.inputs(c).length)).toEqual([100, 100, 50]);
  });

  it("descobre e memoriza a dimensão", async () => {
    const { embedder, calls } = setup();
    expect(embedder.dim).toBeUndefined();
    expect(await embedder.dimension()).toBe(3);
    await embedder.dimension();
    expect(calls).toHaveLength(1);
  });

  it("usa o modelo configurado", async () => {
    const { embedder, calls } = setup(undefined, "outro-modelo");
    await embedder.embed(["x"]);
    expect(embedder.model).toBe("outro-modelo");
    expect(JSON.stringify(calls[0]!.body) + calls[0]!.url.pathname).toContain("outro-modelo");
  });

  it("sem chave, não chama a rede e diz qual variável definir", async () => {
    const { fetch, calls } = fakeFetch((call) => p.ok(call));
    const embedder = p.make({ apiKey: undefined, fetch });
    const error = await embedder.embed(["x"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmbedError);
    expect((error as EmbedError).kind).toBe("auth");
    expect((error as Error).message).toContain(`defina a variável ${p.keyVar}`);
    expect(calls).toEqual([]);
    expect(await embedder.health()).toContain(p.keyVar);
  });

  it("chave recusada vira erro de autenticação, sem vazar a chave", async () => {
    const { embedder } = setup(() => p.error(401, `Incorrect API key provided: ${KEY}`));
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("auth");
    expect(error.message).toContain(`${p.label} recusou a chave em ${p.keyVar}`);
    expect(error.message).not.toContain(KEY);
  });

  it("modelo inexistente vira erro orientado", async () => {
    const { embedder } = setup(() => p.error(404, "model not found"));
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("model-missing");
    expect(error.message).toBe(`${p.label} não conhece o modelo '${p.defaultModel}'. Confira --model`);
  });

  it("429 é tentado de novo e, se passar, devolve os vetores", async () => {
    const { embedder, calls } = setup((call, i) => (i === 0 ? p.error(429, "slow down") : p.ok(call)));
    expect(await embedder.embed(["x"])).toEqual([normalize(vectorFor("x"))]);
    expect(calls).toHaveLength(2);
  });

  it("três 429 seguidos desistem com mensagem de limite", async () => {
    const { embedder, calls } = setup(() => p.error(429, "slow down"));
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("rate-limit");
    expect(error.message).toContain(`${p.label} limitou as requisições (429) mesmo depois de 3 tentativas`);
    expect(calls).toHaveLength(3);
  });

  it("5xx é tentado de novo", async () => {
    const { embedder, calls } = setup((call, i) => (i < 2 ? p.error(503, "overloaded") : p.ok(call)));
    expect(await embedder.embed(["x"])).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it("rede fora vira mensagem orientada", async () => {
    const { embedder } = setup(networkDown);
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("unreachable");
    expect(error.message).toBe(`não consegui falar com ${p.label} (${p.host}). Verifique a conexão`);
  });

  it("timeout vira mensagem orientada", async () => {
    const { embedder } = setup(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(embedder.embed(["x"])).rejects.toThrow(`${p.label} não respondeu em 120s`);
  });

  it("resposta sem vetores é erro, não lista vazia", async () => {
    const { embedder } = setup(() => json({}));
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("bad-response");
  });

  it("número que estoura o float (1e999 vira Infinity) é erro, não vetor", async () => {
    const { embedder } = setup(async (call) => {
      // Replaces the first number of a vector with 1e999, which JSON.parse reads as Infinity.
      const body = (await p.ok(call).text()).replace(/:\[\d+/, ":[1e999");
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    });
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error).toBeInstanceOf(EmbedError);
    expect(error.kind).toBe("bad-response");
  });

  it("outro 4xx mostra a mensagem do provedor", async () => {
    const { embedder } = setup(() => p.error(400, "input too long"));
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("http");
    expect(error.message).toContain("400");
    expect(error.message).toContain("input too long");
  });

  it("health é vazio quando a chave e o modelo funcionam", async () => {
    const { embedder } = setup();
    expect(await embedder.health()).toBe("");
    expect(embedder.dim).toBe(3);
  });

  it("health devolve o problema em vez de lançar", async () => {
    const { embedder } = setup(() => p.error(401, "bad key"));
    expect(await embedder.health()).toContain("recusou a chave");
  });
});

describe("propósito: documento e consulta", () => {
  const capture = (make: (fetch: typeof globalThis.fetch) => Embedder, ok: (call: Call) => Response) => {
    const { fetch, calls } = fakeFetch(ok);
    return { embedder: make(fetch), calls };
  };

  it("Gemini 2 leva o propósito no texto", async () => {
    const { embedder, calls } = capture(
      (fetch) => new GeminiEmbedder({ apiKey: KEY, fetch }),
      (call) => gemini.ok(call),
    );
    await embedder.embed(["nota"]);
    await embedder.embed(["busca"], "query");
    const texts = calls.map((c) => (c.body!.requests as { content: { parts: { text: string }[] } }[])[0]!.content.parts[0]!.text);
    expect(texts).toEqual(["title: none | text: nota", "task: search result | query: busca"]);
    expect(calls[0]!.url.pathname).toBe("/v1beta/models/gemini-embedding-2:batchEmbedContents");
    expect((calls[0]!.body!.requests as { model: string }[])[0]!.model).toBe("models/gemini-embedding-2");
    expect(JSON.stringify(calls[0]!.body)).not.toContain("taskType");
  });

  it("Gemini 001 usa taskType, sem prefixo", async () => {
    const { embedder, calls } = capture(
      (fetch) => new GeminiEmbedder({ apiKey: KEY, fetch, model: "gemini-embedding-001" }),
      (call) => gemini.ok(call),
    );
    await embedder.embed(["nota"]);
    await embedder.embed(["busca"], "query");
    const requests = calls.map((c) => (c.body!.requests as { taskType: string; content: { parts: { text: string }[] } }[])[0]!);
    expect(requests.map((r) => r.taskType)).toEqual(["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]);
    expect(requests.map((r) => r.content.parts[0]!.text)).toEqual(["nota", "busca"]);
  });

  it("Gemini: chave inválida vem como 400 e vira erro de autenticação", async () => {
    const { embedder } = capture(
      (fetch) => new GeminiEmbedder({ apiKey: KEY, fetch, sleep: noSleep }),
      () =>
        json(
          {
            error: {
              code: 400,
              message: "API key not valid. Please pass a valid API key.",
              status: "INVALID_ARGUMENT",
              details: [{ reason: "API_KEY_INVALID" }],
            },
          },
          400,
        ),
    );
    const error = (await embedder.embed(["x"]).catch((e: unknown) => e)) as EmbedError;
    expect(error.kind).toBe("auth");
  });

  it("Voyage manda input_type", async () => {
    const { embedder, calls } = capture(
      (fetch) => new VoyageEmbedder({ apiKey: KEY, fetch }),
      (call) => voyage.ok(call),
    );
    await embedder.embed(["nota"]);
    await embedder.embed(["busca"], "query");
    expect(calls.map((c) => c.body!.input_type)).toEqual(["document", "query"]);
    expect(calls[0]!.url.href).toBe("https://ai.mongodb.com/v1/embeddings");
  });

  it("Voyage aceita outro endereço base", async () => {
    const { embedder, calls } = capture(
      (fetch) => new VoyageEmbedder({ apiKey: KEY, fetch, baseUrl: "https://api.voyageai.com/v1/" }),
      (call) => voyage.ok(call),
    );
    await embedder.embed(["x"]);
    expect(calls[0]!.url.href).toBe("https://api.voyageai.com/v1/embeddings");
  });

  it("OpenAI ignora o propósito", async () => {
    const { embedder, calls } = capture(
      (fetch) => new OpenAIEmbedder({ apiKey: KEY, fetch }),
      (call) => openai.ok(call),
    );
    const purposes: EmbedPurpose[] = ["document", "query"];
    for (const purpose of purposes) await embedder.embed(["x"], purpose);
    expect(calls[0]!.body).toEqual(calls[1]!.body);
    expect(calls[0]!.body).toEqual({ model: "text-embedding-3-small", input: ["x"], encoding_format: "float" });
  });
});

describe("retry-after", () => {
  it("respeita o cabeçalho, com teto de 30s", async () => {
    const waits: number[] = [];
    const { fetch } = fakeFetch((call, i) =>
      i === 0
        ? json({ error: { message: "slow" } }, 429, { "retry-after": "7" })
        : i === 1
          ? json({ error: { message: "slow" } }, 429, { "retry-after": "999" })
          : openai.ok(call),
    );
    const embedder = new OpenAIEmbedder({ apiKey: KEY, fetch, sleep: async (ms) => void waits.push(ms) });
    await embedder.embed(["x"]);
    expect(waits).toEqual([7000, 30000]);
  });

  it("sem cabeçalho, espera 1s e depois 2s", async () => {
    const waits: number[] = [];
    const { fetch } = fakeFetch((call, i) => (i < 2 ? json({ error: { message: "x" } }, 503) : openai.ok(call)));
    const embedder = new OpenAIEmbedder({ apiKey: KEY, fetch, sleep: async (ms) => void waits.push(ms) });
    await embedder.embed(["x"]);
    expect(waits).toEqual([1000, 2000]);
  });
});
