import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ConfigError,
  DEFAULTS,
  configPath,
  expandPath,
  readConfigFile,
  saveConfig,
} from "./config.js";
import type { Config, ProviderName } from "./config.js";

/** The vault path does not exist; the caller decides whether to ask and create it. */
export class VaultNotFoundError extends Error {
  override name = "VaultNotFoundError";
  constructor(readonly path: string) {
    super(`O diretório ${path} não existe.`);
  }
}

export interface InitOptions {
  vault: string;
  provider?: ProviderName | undefined;
  model?: string | undefined;
  git?: boolean | undefined;
  /** Creates the vault directory if it does not exist. */
  create?: boolean | undefined;
  /** Configuration file; defaults to `configPath()`. */
  configFile?: string | undefined;
}

export interface InitResult {
  vault: string;
  configFile: string;
  /** The vault directory was just created. */
  created: boolean;
  /** `.brain/` was just added to `.gitignore`. */
  gitignoreUpdated: boolean;
  /** Problems that did not stop init. */
  warnings: string[];
}

const BRAIN_DIR = ".brain";
const GITIGNORE_ENTRIES = new Set([".brain", ".brain/", "/.brain", "/.brain/"]);

/**
 * Prepares the vault: creates `.brain/`, keeps the index out of Git and writes the
 * configuration. Can be run again without undoing anything.
 */
export function initVault(options: InitOptions): InitResult {
  const vault = expandPath(options.vault);
  const configFile = options.configFile ?? configPath();
  const warnings: string[] = [];

  let created = false;
  if (!existsSync(vault)) {
    if (!options.create) throw new VaultNotFoundError(vault);
    mkdirSync(vault, { recursive: true });
    created = true;
  } else if (!statSync(vault).isDirectory()) {
    throw new ConfigError(`${vault} não é um diretório. Aponte para a pasta do vault.`);
  }

  mkdirSync(join(vault, BRAIN_DIR), { recursive: true });

  let gitignoreUpdated = false;
  if (existsSync(join(vault, ".git"))) {
    try {
      gitignoreUpdated = ensureGitignore(join(vault, ".gitignore"));
    } catch (error) {
      warnings.push(
        `Não consegui atualizar ${join(vault, ".gitignore")} ` +
          `(${(error as Error).message}). Acrescente a linha ".brain/" à mão.`,
      );
    }
  }

  const values: Partial<Config> = { vault };
  const remove: (keyof Config)[] = [];
  if (options.provider !== undefined) {
    values.provider = options.provider;
    // The old model belonged to another provider: without a new model, the default applies.
    const previous = readConfigFile(configFile).provider ?? DEFAULTS.provider;
    if (options.model === undefined && previous !== options.provider) remove.push("model");
  }
  if (options.model !== undefined) values.model = options.model;
  if (options.git !== undefined) values.git = options.git;
  saveConfig(values, configFile, remove);

  return { vault, configFile, created, gitignoreUpdated, warnings };
}

/** Ensures the `.brain/` line in `.gitignore`. Returns whether it had to write. */
function ensureGitignore(file: string): boolean {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => GITIGNORE_ENTRIES.has(line))) return false;

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const separator = content === "" || content.endsWith("\n") ? "" : eol;
  writeFileSync(file, `${content}${separator}.brain/${eol}`);
  return true;
}
