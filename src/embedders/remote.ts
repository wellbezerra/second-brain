import { EmbedError, checkDimension, normalize } from "../embed.js";
import type { EmbedPurpose, Embedder } from "../embed.js";
import { RETRIES, TIMEOUT_MS, postJson, realSleep } from "./http.js";
import type { ProviderInfo } from "./http.js";

export interface RemoteOptions {
  /** Ausente ou vazia: nenhum texto é enviado, e o erro diz qual variável definir. */
  apiKey: string | undefined;
  model?: string;
  /** Injetáveis para teste. */
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const BATCH_SIZE = 100;

/** Base dos clientes de API: lotes, chave, normalização, dimensão e saúde. */
export abstract class RemoteEmbedder implements Embedder {
  abstract readonly provider: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private _dim: number | undefined;

  constructor(
    protected readonly info: ProviderInfo,
    defaultModel: string,
    options: RemoteOptions,
  ) {
    this.model = options.model ?? defaultModel;
    this.apiKey = options.apiKey?.trim() ?? "";
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? realSleep;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  get endpoint(): string {
    return this.info.host;
  }

  get dim(): number | undefined {
    return this._dim;
  }

  async dimension(): Promise<number> {
    if (this._dim === undefined) await this.embed(["dimensão"]);
    return this._dim!;
  }

  async embed(texts: readonly string[], purpose: EmbedPurpose = "document"): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.apiKey === "") {
      throw new EmbedError(
        "auth",
        `defina a variável ${this.info.keyVar} com a sua chave ${this.info.of}`,
      );
    }
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const vectors = await this.embedBatch(batch, purpose);
      if (vectors.length !== batch.length) {
        throw new EmbedError(
          "bad-response",
          `${this.info.label} devolveu ${vectors.length} vetores para ${batch.length} textos`,
        );
      }
      out.push(...vectors);
    }
    this._dim = checkDimension(out, this._dim, this.info.label);
    return out.map(normalize);
  }

  async health(): Promise<string> {
    try {
      await this.embed(["teste"]);
      return "";
    } catch (error) {
      if (error instanceof EmbedError) return error.message;
      throw error;
    }
  }

  /** Um lote, já dentro do limite de tamanho; devolve vetores na ordem de entrada. */
  protected abstract embedBatch(batch: readonly string[], purpose: EmbedPurpose): Promise<number[][]>;

  protected post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    return postJson(this.info, url, headers, body, {
      fetch: this.fetch,
      sleep: this.sleep,
      timeoutMs: this.timeoutMs,
      retries: RETRIES,
      model: this.model,
      apiKey: this.apiKey,
    });
  }

  protected get key(): string {
    return this.apiKey;
  }

  protected noVectors(): EmbedError {
    return new EmbedError("bad-response", `${this.info.label} devolveu uma resposta sem vetores`);
  }
}

/** `data: [{ index, embedding }]`, o formato de OpenAI e Voyage, em ordem de entrada. */
export function indexedEmbeddings(data: unknown, isVector: (v: unknown) => v is number[]): number[][] | undefined {
  const items = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(items)) return undefined;
  const parsed = items.map((item: { index?: unknown; embedding?: unknown }, position) => ({
    index: typeof item?.index === "number" ? item.index : position,
    embedding: item?.embedding,
  }));
  if (!parsed.every((p) => isVector(p.embedding))) return undefined;
  return parsed.sort((a, b) => a.index - b.index).map((p) => p.embedding as number[]);
}
