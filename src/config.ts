import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Erro de configuração: a mensagem diz o que fazer, não só o que falhou. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

export interface Config {
  /** Caminho absoluto do vault. */
  vault: string;
  /** Modelo de embedding no Ollama. */
  model: string;
  ollamaUrl: string;
  /** Pastas ignoradas na varredura. */
  excludes: string[];
  /** Commit automático no vault (ADR 010). */
  git: boolean;
}

export const DEFAULTS: Readonly<Omit<Config, "vault">> = Object.freeze({
  model: "bge-m3",
  ollamaUrl: "http://127.0.0.1:11434",
  excludes: [".obsidian", ".trash", ".git", ".brain", "node_modules"],
  git: false,
});

/** O que pode vir da linha de comando. */
export interface ConfigArgs {
  vault?: string | undefined;
  model?: string | undefined;
  ollamaUrl?: string | undefined;
}

export type Env = Record<string, string | undefined>;

export interface LoadOptions {
  args?: ConfigArgs;
  env?: Env;
  /** Arquivo de configuração; por padrão, `configPath(env)`. */
  file?: string;
}

/** `$XDG_CONFIG_HOME/brain/config.json`, ou `~/.config/brain/config.json`. */
export function configPath(env: Env = process.env): string {
  const base = nonEmpty(env.XDG_CONFIG_HOME) ?? join(homedir(), ".config");
  return join(base, "brain", "config.json");
}

/** Expande `~` e resolve para caminho absoluto. */
export function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * Carrega a configuração. Precedência: argumento > ambiente > arquivo > padrão.
 * Lança `ConfigError` se o arquivo for inválido ou se não houver vault.
 */
export function loadConfig(options: LoadOptions = {}): Config {
  const args = options.args ?? {};
  const env = options.env ?? process.env;
  const file = options.file ?? configPath(env);
  const stored = readConfigFile(file);

  const vault =
    nonEmpty(args.vault) ?? nonEmpty(env.BRAIN_VAULT) ?? nonEmpty(stored.vault);
  if (vault === undefined) {
    throw new ConfigError(
      "Nenhum vault configurado. Resolva de uma destas formas:\n" +
        "  - rode `brain init --vault <caminho>` para gravar a configuração;\n" +
        "  - passe `--vault <caminho>` no comando;\n" +
        "  - defina a variável de ambiente BRAIN_VAULT.",
    );
  }

  return {
    vault: expandPath(vault),
    model:
      nonEmpty(args.model) ??
      nonEmpty(env.BRAIN_MODEL) ??
      stored.model ??
      DEFAULTS.model,
    ollamaUrl:
      nonEmpty(args.ollamaUrl) ??
      nonEmpty(env.BRAIN_OLLAMA_URL) ??
      stored.ollamaUrl ??
      DEFAULTS.ollamaUrl,
    excludes: stored.excludes ?? [...DEFAULTS.excludes],
    git: stored.git ?? DEFAULTS.git,
  };
}

/** Lê o arquivo de configuração. Arquivo ausente devolve `{}`. */
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

/** Grava campos na configuração, preservando os que já estavam lá. */
export function saveConfig(values: Partial<Config>, file: string): void {
  const merged = { ...readConfigFile(file), ...values };
  const out: Record<string, unknown> = {};
  if (merged.vault !== undefined) out.vault = merged.vault;
  if (merged.model !== undefined) out.model = merged.model;
  if (merged.ollamaUrl !== undefined) out.ollama_url = merged.ollamaUrl;
  if (merged.excludes !== undefined) out.excludes = merged.excludes;
  if (merged.git !== undefined) out.git = merged.git;

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

function invalid(file: string, reason: string): ConfigError {
  return new ConfigError(`Configuração inválida em ${file}: ${reason}.`);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}
