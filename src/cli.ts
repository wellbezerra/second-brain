#!/usr/bin/env node
// Única camada que conhece parseArgs, stdout, stdin e process.exit.
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ConfigError, loadSettings, parseProvider } from "./config.js";
import { runDoctor } from "./doctor.js";
import { EmbedError } from "./embed.js";
import { API_KEY_VARS, createEmbedder } from "./embedders/index.js";
import { VaultNotFoundError, initVault } from "./init.js";
import type { InitOptions, InitResult } from "./init.js";
import { version } from "./version.js";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_DEPENDENCY = 3;

const HELP = `brain — segundo cérebro local sobre um vault Obsidian

Uso: brain <comando> [opções]

Configuração
  init      prepara um vault e grava a configuração
            --vault <caminho>  pasta do vault (obrigatório)
            --provider <nome>  openai (padrão), gemini, voyage ou ollama
            --model <nome>     modelo de embedding (padrão: o do provedor)
            --git              ativa o commit automático no vault
            --yes              cria a pasta do vault sem perguntar
  doctor    verifica Node, provedor de embeddings, chave, modelo e vault
            --vault <caminho>  --provider <nome>  --model <nome>

Chaves de API só por variável de ambiente:
  OPENAI_API_KEY, GEMINI_API_KEY, VOYAGE_API_KEY

Opções gerais
  --version   mostra a versão
  --help      mostra esta ajuda
`;

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      version: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const command = positionals[0];
  if (values.version && command === undefined) {
    console.log(version());
    return EXIT_OK;
  }
  if (values.help || command === undefined) {
    console.log(HELP);
    return EXIT_OK;
  }

  switch (command) {
    case "init":
      return runInit(argv.slice(argv.indexOf(command) + 1));
    case "doctor":
      return runDoctorCommand(argv.slice(argv.indexOf(command) + 1));
    default:
      throw new UsageError(
        `Comando desconhecido: ${command}. Veja \`brain --help\`.`,
      );
  }
}

async function runInit(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      vault: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      git: { type: "boolean" },
      yes: { type: "boolean", short: "y" },
    },
  });

  if (!values.vault) {
    throw new UsageError(
      "Informe a pasta do vault: `brain init --vault <caminho>`.",
    );
  }

  const options: InitOptions = {
    vault: values.vault,
    provider: parseProvider(values.provider),
    model: values.model,
    git: values.git,
    create: values.yes ?? false,
  };

  let result: InitResult;
  try {
    result = initVault(options);
  } catch (error) {
    if (!(error instanceof VaultNotFoundError)) throw error;
    if (!(await confirmCreate(error.path))) {
      throw new UsageError(
        `${error.message} Nada foi criado. Confira o caminho, ou use --yes para criá-lo.`,
      );
    }
    result = initVault({ ...options, create: true });
  }

  printInit(result);
  return EXIT_OK;
}

async function runDoctorCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { vault: { type: "string" }, provider: { type: "string" }, model: { type: "string" } },
  });
  const settings = loadSettings({
    args: { vault: values.vault, provider: values.provider, model: values.model },
  });
  const embedder = createEmbedder(settings);
  const checks = await runDoctor({ nodeVersion: process.version, settings, embedder });

  const mark = { ok: "✓", fail: "✗", skip: "–" } as const;
  for (const check of checks) {
    const [first, ...rest] = check.detail.split("\n");
    console.log(`${mark[check.status]} ${check.name.padEnd(9)} ${first}`);
    for (const line of rest) console.log(`  ${" ".repeat(9)} ${line}`);
  }
  return checks.some((c) => c.status === "fail") ? EXIT_DEPENDENCY : EXIT_OK;
}

async function confirmCreate(path: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `O diretório ${path} não existe. Criar? [s/N] `,
    );
    return /^s(im)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function printInit(result: InitResult): void {
  // Ambiente vazio: mostra o que ficou gravado, não o que BRAIN_* sobrepõe agora.
  const settings = loadSettings({ env: {}, file: result.configFile });
  const keyVar = API_KEY_VARS[settings.provider];
  if (result.created) console.log(`Pasta criada: ${result.vault}`);
  console.log(`Vault:         ${result.vault}`);
  console.log(`Embeddings:    ${settings.provider} · ${settings.model}`);
  console.log(`Configuração:  ${result.configFile}`);
  if (result.gitignoreUpdated) console.log(`.gitignore:    .brain/ acrescentado`);
  for (const warning of result.warnings) console.error(`Aviso: ${warning}`);
  if (keyVar) {
    const state = process.env[keyVar]?.trim() ? "definida" : "ainda não definida";
    console.log(`\nChave de API:  ${keyVar} (${state}). Fica só no ambiente, nunca no arquivo.`);
  }
  console.log("\nPróximo passo: brain doctor");
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (
      error instanceof UsageError ||
      error instanceof ConfigError ||
      (error instanceof TypeError && "code" in error &&
        String(error.code).startsWith("ERR_PARSE_ARGS"))
    ) {
      console.error(`Erro: ${(error as Error).message}`);
      process.exitCode = EXIT_USAGE;
      return;
    }
    if (error instanceof EmbedError) {
      console.error(`Erro: ${error.message}`);
      process.exitCode = EXIT_DEPENDENCY;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  },
);
