// `brain init`: records a vault in Brain's own configuration and creates its
// index folder. It reads the vault path and never writes inside it (ADR 012).

import { mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expandPath, indexDir, type PathContext, parseConfigFile } from './config.js';
import { readConfigFile } from './config-file.js';

export class InitError extends Error {
  override name = 'InitError';
}

export interface InitRequest {
  readonly vault: string;
  readonly model?: string;
}

export interface InitContext extends PathContext {
  readonly configPath: string;
  readonly dataDir: string;
}

export interface InitResult {
  /** The vault's real path, as stored in the configuration and in `vault.json`. */
  readonly vault: string;
  readonly indexDir: string;
  readonly configPath: string;
}

export function init(request: InitRequest, ctx: InitContext): InitResult {
  const requested = expandPath(request.vault, ctx);
  let isDirectory: boolean;
  try {
    isDirectory = statSync(requested).isDirectory();
  } catch {
    throw new InitError(`The vault ${requested} does not exist.`);
  }
  if (!isDirectory) throw new InitError(`The vault ${requested} is not a folder.`);
  const vault = realpathSync.native(requested);

  // Read the current configuration before creating anything, so a broken file
  // stops init without side effects instead of being overwritten.
  const current = parseConfigFile(readConfigFile(ctx.configPath));
  const values = {
    ...current.values,
    vault,
    ...(request.model ? { model: request.model } : {}),
  };

  const index = indexDir(ctx.dataDir, vault, ctx.platform);
  mkdirSync(index, { recursive: true });
  writeFileSync(join(index, 'vault.json'), `${JSON.stringify({ vault }, null, 2)}\n`);
  mkdirSync(dirname(ctx.configPath), { recursive: true });
  writeFileSync(ctx.configPath, `${JSON.stringify(values, null, 2)}\n`);

  return { vault, indexDir: index, configPath: ctx.configPath };
}
