// What the API clients share: timeout, retries and translation of HTTP errors.
import { EmbedError } from "../embed.js";

/** How the provider appears in messages: "a OpenAI", "da OpenAI". */
export interface ProviderInfo {
  label: string;
  of: string;
  host: string;
  keyVar: string;
}

export interface RequestOptions {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  /** Extra attempts for 429 and 5xx. */
  retries: number;
  /** For the unknown model message. */
  model: string;
  /** So it never shows up in an error message. */
  apiKey: string;
}

export const TIMEOUT_MS = 120_000;
export const RETRIES = 2;
const MAX_WAIT_MS = 30_000;

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** POST with JSON; returns the parsed response body. */
export async function postJson(
  info: ProviderInfo,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options: RequestOptions,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await options.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const name = (error as Error).name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new EmbedError(
          "timeout",
          `${info.label} não respondeu em ${Math.round(options.timeoutMs / 1000)}s. Tente de novo`,
        );
      }
      throw new EmbedError("unreachable", unreachableMessage(info));
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new EmbedError("bad-response", `${info.label} devolveu uma resposta que não é JSON`);
      }
    }

    const text = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < options.retries) {
      await options.sleep(waitMs(response, attempt));
      continue;
    }
    throw httpError(info, response.status, text, options, attempt + 1);
  }
}

function httpError(
  info: ProviderInfo,
  status: number,
  text: string,
  options: RequestOptions,
  attempts: number,
): EmbedError {
  const detail = redact(errorDetail(text), options.apiKey);
  if (status === 401 || status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid/i.test(text))) {
    return new EmbedError(
      "auth",
      `${info.label} recusou a chave em ${info.keyVar}. Confira se ela está certa e ativa`,
    );
  }
  if (status === 404) {
    return new EmbedError(
      "model-missing",
      `${info.label} não conhece o modelo '${options.model}'. Confira --model`,
    );
  }
  if (status === 429) {
    return new EmbedError(
      "rate-limit",
      `${info.label} limitou as requisições (429) mesmo depois de ${attempts} tentativas. ` +
        "Espere um pouco e rode de novo",
    );
  }
  if (status >= 500) {
    return new EmbedError("unreachable", `${unreachableMessage(info)} — respondeu ${status}`);
  }
  return new EmbedError("http", `${info.label} rejeitou a requisição (${status}): ${detail}`);
}

function unreachableMessage(info: ProviderInfo): string {
  return `não consegui falar com ${info.label} (${info.host}). Verifique a conexão`;
}

/** `retry-after` in seconds, capped; without it, 1s, 2s, 4s... */
function waitMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_WAIT_MS);
  return Math.min(1000 * 2 ** attempt, MAX_WAIT_MS);
}

/** The message the provider sent, in the formats they use. */
function errorDetail(text: string): string {
  try {
    const data = JSON.parse(text) as {
      error?: string | { message?: unknown };
      detail?: unknown;
      message?: unknown;
    };
    const candidates = [
      typeof data.error === "object" ? data.error?.message : data.error,
      data.detail,
      data.message,
    ];
    const found = candidates.find((c): c is string => typeof c === "string" && c !== "");
    if (found) return found;
  } catch {
    // not JSON: use the raw text
  }
  return text.slice(0, 200) || "(sem detalhe)";
}

function redact(text: string, secret: string): string {
  return secret === "" ? text : text.split(secret).join("***");
}
