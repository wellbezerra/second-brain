import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ConfigError, configPath, expandPath, saveConfig } from "./config.js";
import type { Config } from "./config.js";

/** O caminho do vault não existe; quem chama decide se pergunta e cria. */
export class VaultNotFoundError extends Error {
  override name = "VaultNotFoundError";
  constructor(readonly path: string) {
    super(`O diretório ${path} não existe.`);
  }
}

export interface InitOptions {
  vault: string;
  model?: string | undefined;
  git?: boolean | undefined;
  /** Cria o diretório do vault se ele não existir. */
  create?: boolean | undefined;
  /** Arquivo de configuração; por padrão, `configPath()`. */
  configFile?: string | undefined;
}

export interface InitResult {
  vault: string;
  configFile: string;
  /** O diretório do vault foi criado agora. */
  created: boolean;
  /** `.brain/` foi acrescentado ao `.gitignore` agora. */
  gitignoreUpdated: boolean;
  /** Problemas que não impediram o init. */
  warnings: string[];
}

const BRAIN_DIR = ".brain";
const GITIGNORE_ENTRIES = new Set([".brain", ".brain/", "/.brain", "/.brain/"]);

/**
 * Prepara o vault: cria `.brain/`, protege o índice do Git e grava a
 * configuração. Pode ser rodado de novo sem desfazer nada.
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
  if (options.model !== undefined) values.model = options.model;
  if (options.git !== undefined) values.git = options.git;
  saveConfig(values, configFile);

  return { vault, configFile, created, gitignoreUpdated, warnings };
}

/** Garante a linha `.brain/` no `.gitignore`. Devolve se precisou escrever. */
function ensureGitignore(file: string): boolean {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => GITIGNORE_ENTRIES.has(line))) return false;

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const separator = content === "" || content.endsWith("\n") ? "" : eol;
  writeFileSync(file, `${content}${separator}.brain/${eol}`);
  return true;
}
