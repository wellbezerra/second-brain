import { existsSync, statSync } from "node:fs";
import { MISSING_VAULT_MESSAGE } from "./config.js";
import type { Settings } from "./config.js";
import { EmbedError } from "./embed.js";
import type { Embedder } from "./embed.js";

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
  embedder: Embedder;
}

const MIN_NODE_MAJOR = 24;

/**
 * Verifica, em ordem, os pré-requisitos externos. Um item que depende de
 * outro que falhou é pulado, não marcado como falho.
 *
 * Para provedores remotos, verificar custa um embedding de uma palavra: é o
 * único jeito de saber se a chave e o modelo funcionam (ADR 012).
 *
 * SQLite com FTS5 e sqlite-vec entram aqui junto com o índice (spec 04).
 */
export async function runDoctor(input: DoctorInput): Promise<Check[]> {
  const { settings, embedder } = input;
  const checks: Check[] = [checkNode(input.nodeVersion)];

  const where = `${embedder.provider} · ${embedder.model} → ${embedder.endpoint}`;
  const problem = await embedder.health();
  checks.push(problem === "" ? ok("provedor", where) : fail("provedor", `${where}\n${problem}`));

  if (problem !== "") {
    checks.push(skip("dimensão", "depende do provedor"));
  } else {
    try {
      checks.push(ok("dimensão", `${await embedder.dimension()} dimensões`));
    } catch (error) {
      if (!(error instanceof EmbedError)) throw error;
      checks.push(fail("dimensão", error.message));
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

const ok = (name: string, detail: string): Check => ({ name, status: "ok", detail });
const fail = (name: string, detail: string): Check => ({ name, status: "fail", detail });
const skip = (name: string, detail: string): Check => ({ name, status: "skip", detail });
