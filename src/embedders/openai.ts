import { isVector } from "../embed.js";
import { RemoteEmbedder, indexedEmbeddings } from "./remote.js";
import type { RemoteOptions } from "./remote.js";

const BASE_URL = "https://api.openai.com/v1";

/** `POST /v1/embeddings`. Não distingue documento de consulta. */
export class OpenAIEmbedder extends RemoteEmbedder {
  readonly provider = "openai";

  constructor(options: RemoteOptions) {
    super(
      { label: "a OpenAI", of: "da OpenAI", host: "api.openai.com", keyVar: "OPENAI_API_KEY" },
      "text-embedding-3-small",
      options,
    );
  }

  protected async embedBatch(batch: readonly string[]): Promise<number[][]> {
    const data = await this.post(
      `${BASE_URL}/embeddings`,
      { authorization: `Bearer ${this.key}` },
      { model: this.model, input: batch, encoding_format: "float" },
    );
    const vectors = indexedEmbeddings(data, isVector);
    if (!vectors) throw this.noVectors();
    return vectors;
  }
}
