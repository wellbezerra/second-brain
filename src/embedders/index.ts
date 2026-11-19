import type { Env, ProviderName, Settings } from "../config.js";
import type { Embedder } from "../embed.js";
import { GeminiEmbedder } from "./gemini.js";
import { OllamaEmbedder } from "./ollama.js";
import { OpenAIEmbedder } from "./openai.js";
import { VoyageEmbedder } from "./voyage.js";

/** Variável de ambiente com a chave de cada provedor; o Ollama não usa chave. */
export const API_KEY_VARS: Readonly<Record<ProviderName, string | undefined>> = Object.freeze({
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  voyage: "VOYAGE_API_KEY",
  ollama: undefined,
});

/**
 * Cria o cliente do provedor configurado. As chaves vêm só do ambiente
 * (ADR 012); sem chave, o cliente existe, mas recusa embeddar antes de
 * mandar qualquer texto.
 */
export function createEmbedder(
  settings: Pick<Settings, "provider" | "model" | "ollamaUrl">,
  env: Env = process.env,
  fetch?: typeof globalThis.fetch,
): Embedder {
  const common = { model: settings.model, ...(fetch ? { fetch } : {}) };
  switch (settings.provider) {
    case "openai":
      return new OpenAIEmbedder({ ...common, apiKey: env.OPENAI_API_KEY });
    case "gemini":
      return new GeminiEmbedder({ ...common, apiKey: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY });
    case "voyage":
      return new VoyageEmbedder({
        ...common,
        apiKey: env.VOYAGE_API_KEY,
        baseUrl: nonEmpty(env.VOYAGE_BASE_URL),
      });
    case "ollama":
      return new OllamaEmbedder({ ...common, url: settings.ollamaUrl });
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}
