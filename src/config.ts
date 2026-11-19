import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Configuration error: the message says what to do, not only what failed. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

export const PROVIDERS = ["openai", "gemini", "voyage", "ollama"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/** Model used when the configuration does not name one (ADR 012). */
export const DEFAULT_MODELS: Readonly<Record<ProviderName, string>> = Object.freeze({
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-2",
  voyage: "voyage-4",
  ollama: "bge-m3",
});

export interface Config {
  /** Absolute path of the vault. */
  vault: string;
  /** Embedding provider (ADR 012). */
  provider: ProviderName;
  /** Embedding model at the provider. */
  model: string;
  ollamaUrl: string;
  /** Folders ignored by the scan. */
  excludes: string[];
  /** Automatic commit in the vault (ADR 010). */
  git: boolean;
}

export const DEFAULTS: Readonly<Omit<Config, "vault" | "model">> = Object.freeze({
  provider: "openai",
  ollamaUrl: "http://127.0.0.1:11434",
  excludes: [".obsidian", ".trash", ".git", ".brain", "node_modules"],
  git: false,
});

/** What can come from the command line. */
export interface ConfigArgs {
  vault?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  ollamaUrl?: string | undefined;
}

export type Env = Record<string, string | undefined>;

export interface LoadOptions {
  args?: ConfigArgs;
  env?: Env;
  /** Configuration file; defaults to `configPath(env)`. */
  file?: string;
}

/** `$XDG_CONFIG_HOME/brain/config.json`, or `~/.config/brain/config.json`. */
export function configPath(env: Env = process.env): string {
  const base = nonEmpty(env.XDG_CONFIG_HOME) ?? join(homedir(), ".config");
  return join(base, "brain", "config.json");
}

/** Expands `~` and resolves to an absolute path. */
export function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return resolve(path);
}

/** Configuration where the vault may be missing, for diagnostics such as `brain doctor`. */
export type Settings = Omit<Config, "vault"> & { vault?: string };

export const MISSING_VAULT_MESSAGE =
  "Nenhum vault configurado. Resolva de uma destas formas:\n" +
  "  - rode `brain init --vault <caminho>` para gravar a configuração;\n" +
  "  - passe `--vault <caminho>` no comando;\n" +
  "  - defina a variável de ambiente BRAIN_VAULT.";

/**
 * Loads the configuration. Precedence: argument > environment > file > default.
 * Throws `ConfigError` if the file is invalid or there is no vault.
 */
export function loadConfig(options: LoadOptions = {}): Config {
  const settings = loadSettings(options);
  if (settings.vault === undefined) throw new ConfigError(MISSING_VAULT_MESSAGE);
  return { ...settings, vault: settings.vault };
}

/** Like `loadConfig`, but without requiring a vault. */
export function loadSettings(options: LoadOptions = {}): Settings {
  const args = options.args ?? {};
  const env = options.env ?? process.env;
  const file = options.file ?? configPath(env);
  const stored = readConfigFile(file);

  const vault =
    nonEmpty(args.vault) ?? nonEmpty(env.BRAIN_VAULT) ?? nonEmpty(stored.vault);

  const provider =
    parseProvider(nonEmpty(args.provider) ?? nonEmpty(env.BRAIN_PROVIDER)) ??
    stored.provider ??
    DEFAULTS.provider;
  // The file's model belongs to the file's provider: switching provider
  // through an argument or the environment does not carry over a model it does not know.
  const storedModel =
    (stored.provider ?? DEFAULTS.provider) === provider ? stored.model : undefined;

  return {
    ...(vault === undefined ? {} : { vault: expandPath(vault) }),
    provider,
    model:
      nonEmpty(args.model) ??
      nonEmpty(env.BRAIN_MODEL) ??
      storedModel ??
      DEFAULT_MODELS[provider],
    ollamaUrl:
      nonEmpty(args.ollamaUrl) ??
      nonEmpty(env.BRAIN_OLLAMA_URL) ??
      stored.ollamaUrl ??
      DEFAULTS.ollamaUrl,
    excludes: stored.excludes ?? [...DEFAULTS.excludes],
    git: stored.git ?? DEFAULTS.git,
  };
}

/** Reads the configuration file. A missing file returns `{}`. */
export function readConfigFile(file: string): Partial<Config> {
  if (!existsSync(file)) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new ConfigError(
      `O arquivo de configuração ${file} não é um JSON válido ` +
        `(${(error as Error).message}). Corrija-o ou apague-o e rode \`brain init\` de novo.`,
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalid(file, "o conteúdo precisa ser um objeto JSON");
  }
  const data = raw as Record<string, unknown>;
  const config: Partial<Config> = {};

  const vault = data.vault;
  if (vault !== undefined) {
    if (typeof vault !== "string") throw invalid(file, "`vault` precisa ser texto");
    config.vault = vault;
  }
  const provider = data.provider;
  if (provider !== undefined) {
    if (!isProvider(provider)) throw invalid(file, `\`provider\` precisa ser ${providerList()}`);
    config.provider = provider;
  }
  const model = data.model;
  if (model !== undefined) {
    if (typeof model !== "string") throw invalid(file, "`model` precisa ser texto");
    config.model = model;
  }
  const ollamaUrl = data.ollama_url;
  if (ollamaUrl !== undefined) {
    if (typeof ollamaUrl !== "string") {
      throw invalid(file, "`ollama_url` precisa ser texto");
    }
    config.ollamaUrl = ollamaUrl;
  }
  const excludes = data.excludes;
  if (excludes !== undefined) {
    if (!Array.isArray(excludes) || !excludes.every((e) => typeof e === "string")) {
      throw invalid(file, "`excludes` precisa ser uma lista de textos");
    }
    config.excludes = excludes;
  }
  const git = data.git;
  if (git !== undefined) {
    if (typeof git !== "boolean") throw invalid(file, "`git` precisa ser true ou false");
    config.git = git;
  }
  return config;
}

/**
 * Writes fields to the configuration, keeping the existing ones except those
 * listed in `remove`. API keys never go through here (ADR 012).
 */
export function saveConfig(
  values: Partial<Config>,
  file: string,
  remove: readonly (keyof Config)[] = [],
): void {
  const merged: Partial<Config> = { ...readConfigFile(file), ...values };
  for (const key of remove) delete merged[key];
  const out: Record<string, unknown> = {};
  if (merged.vault !== undefined) out.vault = merged.vault;
  if (merged.provider !== undefined) out.provider = merged.provider;
  if (merged.model !== undefined) out.model = merged.model;
  if (merged.ollamaUrl !== undefined) out.ollama_url = merged.ollamaUrl;
  if (merged.excludes !== undefined) out.excludes = merged.excludes;
  if (merged.git !== undefined) out.git = merged.git;

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

/** Validates a provider coming from an argument or the environment. */
export function parseProvider(value: string | undefined): ProviderName | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (isProvider(normalized)) return normalized;
  throw new ConfigError(`Provedor desconhecido: '${value}'. Use ${providerList()}.`);
}

function isProvider(value: unknown): value is ProviderName {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

function providerList(): string {
  return `${PROVIDERS.slice(0, -1).join(", ")} ou ${PROVIDERS.at(-1)}`;
}

function invalid(file: string, reason: string): ConfigError {
  return new ConfigError(`Configuração inválida em ${file}: ${reason}.`);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}
