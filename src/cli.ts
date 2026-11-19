#!/usr/bin/env node
// Única camada que conhece parseArgs, stdout, stdin e process.exit.
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ConfigError } from "./config.js";
import { VaultNotFoundError, initVault } from "./init.js";
import type { InitOptions, InitResult } from "./init.js";
import { version } from "./version.js";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const HELP = `brain — segundo cérebro local sobre um vault Obsidian

Uso: brain <comando> [opções]

Configuração
  init      prepara um vault e grava a configuração
            --vault <caminho>  pasta do vault (obrigatório)
            --model <nome>     modelo de embedding no Ollama (padrão: bge-m3)
            --git              ativa o commit automático no vault
            --yes              cria a pasta do vault sem perguntar

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
  if (result.created) console.log(`Pasta criada: ${result.vault}`);
  console.log(`Vault:         ${result.vault}`);
  console.log(`Configuração:  ${result.configFile}`);
  if (result.gitignoreUpdated) console.log(`.gitignore:    .brain/ acrescentado`);
  for (const warning of result.warnings) console.error(`Aviso: ${warning}`);
  console.log("\nPróximo passo: brain index");
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
    console.error(error);
    process.exitCode = 1;
  },
);
