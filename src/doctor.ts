import { existsSync, statSync } from "node:fs";
import { MISSING_VAULT_MESSAGE } from "./config.js";
import type { Settings } from "./config.js";
import { EmbedError } from "./embed.js";
import type { OllamaEmbedder } from "./embed.js";

export type CheckStatus = "ok" | "fail" | "skip";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorInput {
  /** `process.version`. */
  nodeVersion: string;
  settings: Settings;
  embedder: OllamaEmbedder;
}

const MIN_NODE_MAJOR = 24;

/**
 * Verifica, em ordem, os pré-requisitos externos. Um item que depende de
 * outro que falhou é pulado, não marcado como falho.
 *
 * SQLite com FTS5 e sqlite-vec entram aqui junto com o índice (spec 04).
 */
export async function runDoctor(input: DoctorInput): Promise<Check[]> {
  const { settings, embedder } = input;
  const checks: Check[] = [checkNode(input.nodeVersion)];

  let models: string[] | undefined;
  try {
    models = await embedder.listModels();
    checks.push(ok("ollama", `respondendo em ${embedder.url}`));
  } catch (error) {
    checks.push(fail("ollama", message(error)));
  }

  const hasModel = models !== undefined && embedder.hasModel(models);
  if (models === undefined) {
    checks.push(skip("modelo", "depende do Ollama"));
  } else if (hasModel) {
    checks.push(ok("modelo", `${embedder.model} disponível`));
  } else {
    checks.push(fail("modelo", (await embedder.health()) || `${embedder.model} ausente`));
  }

  if (!hasModel) {
    checks.push(skip("dimensão", "depende do modelo"));
  } else {
    try {
      checks.push(ok("dimensão", `${await embedder.dimension()} dimensões`));
    } catch (error) {
      checks.push(fail("dimensão", message(error)));
    }
  }

  checks.push(checkVault(settings.vault));
  return checks;
}

function checkNode(version: string): Check {
  const major = Number(/^v?(\d+)/.exec(version)?.[1] ?? 0);
  return major >= MIN_NODE_MAJOR
    ? ok("node", version)
    : fail("node", `${version}; o Brain precisa do Node ${MIN_NODE_MAJOR} ou mais novo`);
}

function checkVault(vault: string | undefined): Check {
  if (vault === undefined) return fail("vault", MISSING_VAULT_MESSAGE);
  if (!existsSync(vault)) return fail("vault", `${vault} não existe. Rode \`brain init --vault <caminho>\`.`);
  if (!statSync(vault).isDirectory()) return fail("vault", `${vault} não é um diretório.`);
  return ok("vault", vault);
}

function message(error: unknown): string {
  if (error instanceof EmbedError) return error.message;
  throw error;
}

const ok = (name: string, detail: string): Check => ({ name, status: "ok", detail });
const fail = (name: string, detail: string): Check => ({ name, status: "fail", detail });
const skip = (name: string, detail: string): Check => ({ name, status: "skip", detail });
