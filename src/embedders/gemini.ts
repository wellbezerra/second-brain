import { isVector } from "../embed.js";
import type { EmbedPurpose } from "../embed.js";
import { RemoteEmbedder } from "./remote.js";
import type { RemoteOptions } from "./remote.js";

const BASE_URL = "https://generativelanguage.googleapis.com";

/** Models older than gemini-embedding-2 receive the purpose in `taskType`. */
const LEGACY_MODEL = /^(gemini-embedding-001|text-embedding-|embedding-)/;

/**
 * `batchEmbedContents`. gemini-embedding-2 does not accept `taskType`: the
 * purpose goes in the text itself, in the format Google's documentation asks for.
 */
export class GeminiEmbedder extends RemoteEmbedder {
  readonly provider = "gemini";

  constructor(options: RemoteOptions) {
    super(
      {
        label: "o Gemini",
        of: "do Gemini",
        host: "generativelanguage.googleapis.com",
        keyVar: "GEMINI_API_KEY",
      },
      "gemini-embedding-2",
      options,
    );
  }

  protected async embedBatch(batch: readonly string[], purpose: EmbedPurpose): Promise<number[][]> {
    const legacy = LEGACY_MODEL.test(this.model);
    const requests = batch.map((text) => ({
      model: `models/${this.model}`,
      content: { parts: [{ text: legacy ? text : withPurpose(text, purpose) }] },
      ...(legacy ? { taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" } : {}),
    }));
    const data = await this.post(
      `${BASE_URL}/v1beta/models/${encodeURIComponent(this.model)}:batchEmbedContents`,
      { "x-goog-api-key": this.key },
      { requests },
    );
    const embeddings = (data as { embeddings?: unknown } | null)?.embeddings;
    if (!Array.isArray(embeddings)) throw this.noVectors();
    const vectors = embeddings.map((e: { values?: unknown }) => e?.values);
    if (!vectors.every(isVector)) throw this.noVectors();
    return vectors;
  }
}

function withPurpose(text: string, purpose: EmbedPurpose): string {
  return purpose === "query" ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
}
