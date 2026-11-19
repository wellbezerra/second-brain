import { EmbedError, checkDimension, isVector, normalize } from "../embed.js";
import type { EmbedPurpose, Embedder } from "../embed.js";

export interface OllamaOptions {
  url: string;
  model: string;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
  batchSize?: number;
  timeoutMs?: number;
}

const BATCH_SIZE = 32;
const TIMEOUT_MS = 120_000;

/** Local Ollama (ADR 003, kept as an option by ADR 012). Does not distinguish query from document. */
export class OllamaEmbedder implements Embedder {
  readonly provider = "ollama";
  readonly url: string;
  readonly model: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private legacy = false;
  private _dim: number | undefined;

  constructor(options: OllamaOptions) {
    this.url = options.url.replace(/\/+$/, "");
    this.model = options.model;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  get endpoint(): string {
    return `${this.url} (local)`;
  }

  get dim(): number | undefined {
    return this._dim;
  }

  async dimension(): Promise<number> {
    if (this._dim === undefined) await this.embed(["dimensão"]);
    return this._dim!;
  }

  async embed(texts: readonly string[], _purpose?: EmbedPurpose): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const vectors = this.legacy ? await this.embedLegacy(batch) : await this.embedBatch(batch);
      out.push(...vectors);
    }
    if (out.length > 0) this._dim = checkDimension(out, this._dim, "o Ollama");
    return out.map(normalize);
  }

  async health(): Promise<string> {
    try {
      const models = await this.listModels();
      return this.hasModel(models) ? "" : this.modelMissingMessage();
    } catch (error) {
      if (error instanceof EmbedError) return error.message;
      throw error;
    }
  }

  /** Models pulled in Ollama (`GET /api/tags`). */
  async listModels(): Promise<string[]> {
    const response = await this.request("/api/tags");
    if (!response.ok) throw this.httpError(response.status, await response.text());
    const data = (await readJson(response)) as { models?: { name?: string }[] } | null;
    const models = Array.isArray(data?.models) ? data.models : [];
    return models.map((m) => (typeof m?.name === "string" ? m.name : "")).filter((n) => n !== "");
  }

  hasModel(models: readonly string[]): boolean {
    const wanted = this.model.includes(":") ? this.model : `${this.model}:latest`;
    return models.some((m) => m === this.model || m === wanted);
  }

  private async embedBatch(batch: string[]): Promise<number[][]> {
    const response = await this.request("/api/embed", { model: this.model, input: batch });
    if (response.status === 404) {
      const body = await response.text();
      if (isModelMissing(body)) throw this.modelMissing();
      // Old Ollama: /api/embed does not exist.
      this.legacy = true;
      return this.embedLegacy(batch);
    }
    if (!response.ok) throw this.httpError(response.status, await response.text());

    const data = (await readJson(response)) as { embeddings?: unknown } | null;
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings) || !embeddings.every(isVector)) {
      throw new EmbedError("bad-response", "o Ollama devolveu uma resposta sem vetores");
    }
    if (embeddings.length !== batch.length) {
      throw new EmbedError(
        "bad-response",
        `o Ollama devolveu ${embeddings.length} vetores para ${batch.length} textos`,
      );
    }
    return embeddings;
  }

  private async embedLegacy(batch: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const prompt of batch) {
      const response = await this.request("/api/embeddings", { model: this.model, prompt });
      if (!response.ok) {
        const body = await response.text();
        if (isModelMissing(body)) throw this.modelMissing();
        throw this.httpError(response.status, body);
      }
      const data = (await readJson(response)) as { embedding?: unknown } | null;
      const embedding = data?.embedding;
      if (!isVector(embedding)) {
        throw new EmbedError("bad-response", "o Ollama devolveu uma resposta sem vetores");
      }
      out.push(embedding);
    }
    return out;
  }

  private async request(path: string, body?: unknown): Promise<Response> {
    try {
      return await this.fetch(`${this.url}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {} : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = (error as Error).name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new EmbedError(
          "timeout",
          `o Ollama não respondeu em ${Math.round(this.timeoutMs / 1000)}s. ` +
            "Modelo grande demais para esta máquina?",
        );
      }
      throw new EmbedError(
        "unreachable",
        `não consegui falar com o Ollama em ${this.url}. Ele está rodando? (ollama serve)`,
      );
    }
  }

  private modelMissingMessage(): string {
    return `o modelo '${this.model}' não está baixado. Rode: ollama pull ${this.model}`;
  }

  private modelMissing(): EmbedError {
    return new EmbedError("model-missing", this.modelMissingMessage());
  }

  private httpError(status: number, body: string): EmbedError {
    const detail = errorField(body) ?? body.slice(0, 200);
    return new EmbedError("http", `o Ollama respondeu ${status}: ${detail}`);
  }
}

/** Body of a 2xx response; anything that is not JSON (a proxy, an error page) is a malformed response. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new EmbedError("bad-response", "o Ollama devolveu uma resposta que não é JSON");
  }
}

function isModelMissing(body: string): boolean {
  return /model .*not found/i.test(errorField(body) ?? "");
}

function errorField(body: string): string | undefined {
  try {
    const data = JSON.parse(body) as { error?: unknown };
    return typeof data.error === "string" ? data.error : undefined;
  } catch {
    return undefined;
  }
}
