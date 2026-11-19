import { isVector } from "../embed.js";
import type { EmbedPurpose } from "../embed.js";
import { RemoteEmbedder, indexedEmbeddings } from "./remote.js";
import type { RemoteOptions } from "./remote.js";

/** Chaves do MongoDB Atlas. Chaves da plataforma antiga usam https://api.voyageai.com/v1. */
const BASE_URL = "https://ai.mongodb.com/v1";

/** Voyage AI, the provider Anthropic recommends. `input_type` distinguishes query from document. */
export class VoyageEmbedder extends RemoteEmbedder {
  readonly provider = "voyage";
  private readonly baseUrl: string;

  constructor(options: RemoteOptions & { baseUrl?: string | undefined }) {
    const baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/+$/, "");
    super(
      { label: "a Voyage", of: "da Voyage", host: new URL(baseUrl).host, keyVar: "VOYAGE_API_KEY" },
      "voyage-4",
      options,
    );
    this.baseUrl = baseUrl;
  }

  protected async embedBatch(batch: readonly string[], purpose: EmbedPurpose): Promise<number[][]> {
    const data = await this.post(
      `${this.baseUrl}/embeddings`,
      { authorization: `Bearer ${this.key}` },
      { input: batch, model: this.model, input_type: purpose },
    );
    const vectors = indexedEmbeddings(data, isVector);
    if (!vectors) throw this.noVectors();
    return vectors;
  }
}
