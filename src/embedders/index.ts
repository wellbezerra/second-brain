import { ConfigError } from "../config.js";
import type { Env, ProviderName, Settings } from "../config.js";
import type { Embedder } from "../embed.js";
import { GeminiEmbedder } from "./gemini.js";
import { OllamaEmbedder } from "./ollama.js";
import { OpenAIEmbedder } from "./openai.js";
import { VoyageEmbedder } from "./voyage.js";

/** Environment variable holding each provider's key; Ollama uses no key. */
export const API_KEY_VARS: Readonly<Record<ProviderName, string | undefined>> = Object.freeze({
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  voyage: "VOYAGE_API_KEY",
  ollama: undefined,
});

/**
 * Creates the client for the configured provider. Keys come only from the environment
 * (ADR 012); without a key, the client exists but refuses to embed before
 * sending any text.
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
        baseUrl: httpUrl("VOYAGE_BASE_URL", nonEmpty(env.VOYAGE_BASE_URL)),
      });
    case "ollama":
      return new OllamaEmbedder({ ...common, url: settings.ollamaUrl });
  }
}

/** Base URL from the environment: must be http(s), since the key is sent along. */
function httpUrl(variable: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let protocol: string | undefined;
  try {
    protocol = new URL(value).protocol;
  } catch {
    protocol = undefined;
  }
  if (protocol !== "https:" && protocol !== "http:") {
    throw new ConfigError(
      `${variable} não é um endereço http(s) válido: '${value}'. ` +
        "Use algo como https://api.voyageai.com/v1, ou apague a variável para usar o padrão.",
    );
  }
  return value;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}
