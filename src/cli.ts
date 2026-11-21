#!/usr/bin/env node
// The only module allowed to print, read stdin or exit the process.

import { homedir } from 'node:os';
import { parseCommand } from './commands.js';
import { ConfigError, type ConfigFile, configPath, dataDir, parseConfigFile } from './config.js';
import { readConfigFile } from './config-file.js';
import { resolveFlags } from './flags.js';
import { InitError, init } from './init.js';
import { version } from './version.js';

const HELP = `Usage: brain <command>

Commands:
  init --vault <path> [--model <name>]   configure the vault (feature flag: init)

Options:
  -h, --help       show this help
  -v, --version    print the version`;

const env = process.env;
const home = homedir();
const platform = process.platform;
const configFilePath = configPath(env, home, platform);

// Read once at startup. A broken file only fails the commands that need it,
// so `--version` and `--help` keep working.
let configFile: ConfigFile | ConfigError;
try {
  configFile = parseConfigFile(readConfigFile(configFilePath));
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  configFile = error;
}
const flags = resolveFlags(
  configFile instanceof ConfigError ? undefined : configFile.features,
  env.SECOND_BRAIN_FEATURES,
);

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

const command = parseCommand(process.argv.slice(2));
switch (command.kind) {
  case 'version':
    console.log(version());
    break;
  case 'help':
    console.log(HELP);
    break;
  case 'usage':
    fail(command.message, 2);
    break;
  case 'unknown':
    fail(`brain: unknown command '${command.name}'\n\n${HELP}`, 2);
    break;
  case 'init': {
    if (!flags.init) {
      fail(
        'brain init is behind the "init" feature flag, which is off by default.\n' +
          'Turn it on with SECOND_BRAIN_FEATURES=init, or add "features": ["init"] to ' +
          `${configFilePath}.`,
        2,
      );
    }
    try {
      const result = init(command, {
        home,
        cwd: process.cwd(),
        platform,
        configPath: configFilePath,
        dataDir: dataDir(env, home, platform),
      });
      console.log(
        [
          `Vault:  ${result.vault}`,
          `Index:  ${result.indexDir}`,
          `Config: ${result.configPath}`,
          '',
          'Next: brain index (arrives with incremental indexing, spec 05)',
        ].join('\n'),
      );
    } catch (error) {
      if (error instanceof ConfigError || error instanceof InitError) fail(error.message, 1);
      throw error;
    }
  }
}
