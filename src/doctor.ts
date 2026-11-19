import { existsSync, statSync } from "node:fs";
import { MISSING_VAULT_MESSAGE } from "./config.js";
import { sqliteInfo } from "./db.js";
import type { SqliteInfo } from "./db.js";
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
  /** Injectable for tests; defaults to the real SQLite. */
  sqlite?: () => SqliteInfo;
}

const MIN_NODE_MAJOR = 24;

/**
 * Checks the external prerequisites in order. An item that depends on
 * one that failed is skipped, not marked as failed.
 *
 * For remote providers, checking costs a one-word embedding: it is the
 * only way to know whether the key and the model work (ADR 012).
 */
export async function runDoctor(input: DoctorInput): Promise<Check[]> {
  const { settings, embedder } = input;
  const checks: Check[] = [checkNode(input.nodeVersion), ...checkSqlite((input.sqlite ?? sqliteInfo)())];

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

function checkSqlite(info: SqliteInfo): Check[] {
  const sqlite = info.fts5
    ? ok("sqlite", `${info.version} com FTS5`)
    : fail(
        "sqlite",
        `${info.version} sem FTS5: a busca por palavra-chave não funciona. Reinstale as dependências (npm install).`,
      );
  const vec =
    "version" in info.vec
      ? ok("sqlite-vec", info.vec.version)
      : fail(
          "sqlite-vec",
          `não carregou: ${info.vec.error}\nConfira se o pacote sqlite-vec da sua plataforma foi instalado (npm install).`,
        );
  return [sqlite, vec];
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
