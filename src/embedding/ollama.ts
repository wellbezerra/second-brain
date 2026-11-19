// The real embedder: Ollama on localhost (ADR 003). Exercised only by
// integration tests, which skip when Ollama is not reachable.

import { type Embedder, normalize } from './embedder.js';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const BATCH_SIZE = 32;

export class OllamaError extends Error {
  override name = 'OllamaError';
}

export class OllamaEmbedder implements Embedder {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(model = 'bge-m3', baseUrl = DEFAULT_OLLAMA_URL, timeoutMs = 120_000) {
    this.model = model;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await this.embedBatch(texts.slice(start, start + BATCH_SIZE))));
    }
    return vectors;
  }

  private async embedBatch(input: readonly string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new OllamaError(
        `could not reach Ollama at ${this.baseUrl}. Is it running? (ollama serve)`,
      );
    }
    if (response.status === 404) {
      throw new OllamaError(
        `the model '${this.model}' is not pulled. Run: ollama pull ${this.model}`,
      );
    }
    if (!response.ok) throw new OllamaError(`Ollama answered HTTP ${response.status}`);
    const body = (await response.json()) as { embeddings?: number[][] };
    const embeddings = body.embeddings ?? [];
    if (embeddings.length !== input.length) {
      throw new OllamaError(
        `Ollama returned ${embeddings.length} vectors for ${input.length} texts`,
      );
    }
    return embeddings.map(normalize);
  }
}
