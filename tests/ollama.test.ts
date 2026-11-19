import { describe, expect, it } from "vitest";
import { EmbedError, normalize } from "../src/embed.js";
import { OllamaEmbedder } from "../src/embedders/ollama.js";

interface Call {
  path: string;
  body: Record<string, unknown> | undefined;
}

type Handler = (path: string, body: Record<string, unknown> | undefined) => Response;

/** fetch falso: registra as chamadas e responde com o handler. */
function fakeFetch(handler: Handler) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ path, body });
    return handler(path, body);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** Vetor determinístico e não normalizado para o texto. */
const vectorFor = (text: string) => [text.length, 1, 2];

const embedHandler: Handler = (path, body) => {
  if (path === "/api/embed") {
    return json({ embeddings: (body!.input as string[]).map(vectorFor) });
  }
  return new Response("404 page not found", { status: 404 });
};

function client(handler: Handler, options: Partial<{ batchSize: number; timeoutMs: number }> = {}) {
  const { fetch, calls } = fakeFetch(handler);
  const embedder = new OllamaEmbedder({
    url: "http://127.0.0.1:11434",
    model: "bge-m3",
    fetch,
    ...options,
  });
  return { embedder, calls };
}

const norm = (v: number[]) => Math.hypot(...v);

describe("normalize", () => {
  it("devolve norma 1", () => {
    expect(norm(normalize([3, 4]))).toBeCloseTo(1, 6);
  });
  it("vetor de norma zero passa sem alteração", () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("OllamaEmbedder", () => {
  it("identifica provedor, modelo e destino", () => {
    const { embedder } = client(embedHandler);
    expect(embedder.provider).toBe("ollama");
    expect(embedder.model).toBe("bge-m3");
    expect(embedder.endpoint).toBe("http://127.0.0.1:11434 (local)");
  });

  it("ignora o propósito", async () => {
    const { embedder, calls } = client(embedHandler);
    await embedder.embed(["a"], "query");
    expect(calls[0]!.body).toEqual({ model: "bge-m3", input: ["a"] });
  });

  it("embed([]) devolve [] sem chamar a rede", async () => {
    const { embedder, calls } = client(embedHandler);
    expect(await embedder.embed([])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("lote simples vai em uma chamada, com o modelo configurado", async () => {
    const { embedder, calls } = client(embedHandler);
    const vectors = await embedder.embed(["a", "bb"]);
    expect(calls).toEqual([{ path: "/api/embed", body: { model: "bge-m3", input: ["a", "bb"] } }]);
    expect(vectors).toEqual([normalize(vectorFor("a")), normalize(vectorFor("bb"))]);
  });

  it("todo vetor sai com norma 1", async () => {
    const { embedder } = client(embedHandler);
    for (const v of await embedder.embed(["x", "texto maior", "outro"])) {
      expect(Math.abs(norm(v) - 1)).toBeLessThan(1e-6);
    }
  });

  it("lote maior que 32 é dividido e devolvido na ordem de entrada", async () => {
    const { embedder, calls } = client(embedHandler);
    const texts = Array.from({ length: 70 }, (_, i) => "t".repeat(i + 1));
    const vectors = await embedder.embed(texts);
    expect(calls.map((c) => (c.body!.input as string[]).length)).toEqual([32, 32, 6]);
    expect(vectors).toEqual(texts.map((t) => normalize(vectorFor(t))));
  });

  it("descobre e memoriza a dimensão", async () => {
    const { embedder, calls } = client(embedHandler);
    expect(embedder.dim).toBeUndefined();
    expect(await embedder.dimension()).toBe(3);
    expect(embedder.dim).toBe(3);
    await embedder.dimension();
    expect(calls).toHaveLength(1);
  });

  it("404 em /api/embed cai para /api/embeddings, um texto por chamada", async () => {
    const { embedder, calls } = client((path, body) =>
      path === "/api/embeddings"
        ? json({ embedding: vectorFor(body!.prompt as string) })
        : new Response("404 page not found", { status: 404 }),
    );
    const vectors = await embedder.embed(["a", "bb"]);
    expect(vectors).toEqual([normalize(vectorFor("a")), normalize(vectorFor("bb"))]);
    expect(calls.map((c) => c.path)).toEqual(["/api/embed", "/api/embeddings", "/api/embeddings"]);

    await embedder.embed(["ccc"]);
    expect(calls.at(-1)!.path).toBe("/api/embeddings");
    expect(calls.filter((c) => c.path === "/api/embed")).toHaveLength(1);
  });

  it("modelo não baixado dá mensagem orientada, sem cair no fallback", async () => {
    const { embedder, calls } = client(() =>
      json({ error: 'model "bge-m3" not found, try pulling it first' }, 404),
    );
    await expect(embedder.embed(["a"])).rejects.toThrow(
      "o modelo 'bge-m3' não está baixado. Rode: ollama pull bge-m3",
    );
    expect(calls).toHaveLength(1);
  });

  it("Ollama fora do ar dá mensagem orientada", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    });
    const embedder = new OllamaEmbedder({ url: "http://127.0.0.1:11434", model: "bge-m3", fetch });
    const error = await embedder.embed(["a"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmbedError);
    expect((error as EmbedError).kind).toBe("unreachable");
    expect((error as Error).message).toBe(
      "não consegui falar com o Ollama em http://127.0.0.1:11434. Ele está rodando? (ollama serve)",
    );
  });

  it("timeout dá mensagem orientada", async () => {
    const { fetch } = fakeFetch(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const embedder = new OllamaEmbedder({ url: "http://127.0.0.1:11434", model: "bge-m3", fetch });
    await expect(embedder.embed(["a"])).rejects.toThrow(
      "o Ollama não respondeu em 120s. Modelo grande demais para esta máquina?",
    );
  });

  it("contagem errada de vetores é erro", async () => {
    const { embedder } = client(() => json({ embeddings: [[1, 0]] }));
    await expect(embedder.embed(["a", "b", "c"])).rejects.toThrow(
      "o Ollama devolveu 1 vetores para 3 textos",
    );
  });

  it("resposta vazia é erro, não lista vazia", async () => {
    const { embedder } = client(() => json({}));
    await expect(embedder.embed(["a"])).rejects.toThrow(EmbedError);
  });

  it("vetores de dimensões diferentes são erro", async () => {
    const { embedder } = client(() => json({ embeddings: [[1, 0], [1, 0, 0]] }));
    await expect(embedder.embed(["a", "b"])).rejects.toThrow(EmbedError);
  });

  it("resposta que não é JSON vira EmbedError, não SyntaxError", async () => {
    const { embedder } = client(() => new Response("<html>proxy</html>", { status: 200 }));
    const error = (await embedder.embed(["a"]).catch((e: unknown) => e)) as EmbedError;
    expect(error).toBeInstanceOf(EmbedError);
    expect(error.kind).toBe("bad-response");
    expect(error.message).toBe("o Ollama devolveu uma resposta que não é JSON");
  });

  it("resposta que não é JSON no modo antigo também vira EmbedError", async () => {
    const { embedder } = client((path) =>
      path === "/api/embed"
        ? new Response("404 page not found", { status: 404 })
        : new Response("<html>", { status: 200 }),
    );
    await expect(embedder.embed(["a"])).rejects.toMatchObject({ kind: "bad-response" });
  });

  it("número que estoura o float (1e999 vira Infinity) é erro, não vetor", async () => {
    const { embedder } = client(
      () => new Response('{"embeddings":[[1e999,1,2]]}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    await expect(embedder.embed(["a"])).rejects.toMatchObject({ kind: "bad-response" });
  });

  it("outro erro HTTP vira EmbedError com o status", async () => {
    const { embedder } = client(() => json({ error: "falhou" }, 500));
    await expect(embedder.embed(["a"])).rejects.toThrow(/500/);
  });

  describe("health", () => {
    const tags = (names: string[]) => () => json({ models: names.map((name) => ({ name })) });

    it("vazio quando o modelo está baixado (com ou sem :latest)", async () => {
      expect(await client(tags(["bge-m3:latest"])).embedder.health()).toBe("");
      expect(await client(tags(["bge-m3"])).embedder.health()).toBe("");
    });

    it("aponta o modelo ausente", async () => {
      expect(await client(tags(["nomic-embed-text:latest"])).embedder.health()).toBe(
        "o modelo 'bge-m3' não está baixado. Rode: ollama pull bge-m3",
      );
    });

    it("lista de modelos que não é JSON vira problema, não exceção", async () => {
      const { embedder } = client(() => new Response("<html>", { status: 200 }));
      expect(await embedder.health()).toBe("o Ollama devolveu uma resposta que não é JSON");
    });

    it("aponta o Ollama fora do ar", async () => {
      const { fetch } = fakeFetch(() => {
        throw new TypeError("fetch failed");
      });
      const embedder = new OllamaEmbedder({ url: "http://127.0.0.1:11434", model: "bge-m3", fetch });
      expect(await embedder.health()).toMatch(/^não consegui falar com o Ollama/);
    });
  });
});
