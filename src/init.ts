// `brain init`: records a vault in Brain's own configuration and creates its
// index folder. It reads the vault path and never writes inside it (ADR 012).

import { mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
  for (const [what, path] of [
    ['index folder', index],
    ['configuration file', ctx.configPath],
  ] as const) {
    if (isInside(realPathOf(path), vault)) {
      throw new InitError(
        `The ${what} ${path} would be inside the vault ${vault}, and Brain never writes to the vault.`,
      );
    }
  }

  mkdirSync(index, { recursive: true });
  writeFileSync(join(index, 'vault.json'), `${JSON.stringify({ vault }, null, 2)}\n`);
  mkdirSync(dirname(ctx.configPath), { recursive: true });
  writeFileSync(ctx.configPath, `${JSON.stringify(values, null, 2)}\n`);

  return { vault, indexDir: index, configPath: ctx.configPath };
}

/** The real path of `path`, resolving links in the part of it that exists. */
function realPathOf(path: string): string {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      return join(realpathSync.native(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.push(basename(current));
      current = parent;
    }
  }
}

function isInside(path: string, folder: string): boolean {
  const rel = relative(folder, path);
  const outside = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  return !outside;
}
