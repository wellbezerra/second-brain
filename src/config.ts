// Configuration: precedence, validation and the locations derived from it.
// Pure — the caller reads the file and passes home, cwd, platform and env in.

import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export type Env = Readonly<Record<string, string | undefined>>;

/** The configuration file as read from disk; `contents` is null when it does not exist. */
export interface ConfigFileSource {
  readonly path: string;
  readonly contents: string | null;
}

/** A validated configuration file. Unknown keys are kept so a rewrite does not lose them. */
export interface ConfigFile {
  readonly path: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly vault?: string;
  readonly model?: string;
  readonly ollama_url?: string;
  readonly excludes?: readonly string[];
  readonly features?: readonly string[];
}

export interface Config {
  readonly vault: string;
  readonly model: string;
  readonly ollamaUrl: string;
  readonly excludes: readonly string[];
}

export interface PathContext {
  readonly home: string;
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
}

export const DEFAULTS: Omit<Config, 'vault'> = {
  model: 'bge-m3',
  ollamaUrl: 'http://127.0.0.1:11434',
  excludes: ['.obsidian', '.trash', '.git', 'node_modules'],
};

const pathFor = (platform: NodeJS.Platform) => (platform === 'win32' ? win32 : posix);

export function parseConfigFile(source: ConfigFileSource): ConfigFile {
  if (source.contents === null) return { path: source.path, values: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.contents);
  } catch (error) {
    throw new ConfigError(`${source.path} is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${source.path} must hold a JSON object.`);
  }
  const values = parsed as Record<string, unknown>;
  const wrong = (field: string, expected: string) =>
    new ConfigError(`"${field}" in ${source.path} must be ${expected}.`);

  const file: { -readonly [K in keyof ConfigFile]: ConfigFile[K] } = { path: source.path, values };
  for (const field of ['vault', 'model', 'ollama_url'] as const) {
    const value = values[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw wrong(field, 'a string');
    file[field] = value;
  }
  for (const field of ['excludes', 'features'] as const) {
    const value = values[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw wrong(field, 'a list of strings');
    }
    file[field] = value;
  }
  return file;
}

/** Expands a leading `~` and resolves the path to absolute. */
export function expandPath(path: string, ctx: PathContext): string {
  const p = pathFor(ctx.platform);
  const expanded =
    path === '~' || path.startsWith('~/') || path.startsWith(`~${p.sep}`)
      ? p.join(ctx.home, path.slice(1))
      : path;
  return p.resolve(ctx.cwd, expanded);
}

/** The first value that is set; an empty string counts as unset, like an empty variable. */
const firstSet = (...values: (string | undefined)[]) => values.find((value) => value);

export interface ResolveInput extends PathContext {
  readonly args: { readonly vault?: string; readonly model?: string };
  readonly env: Env;
  readonly file: ConfigFile;
}

export function resolveConfig(input: ResolveInput): Config {
  const { args, env, file } = input;
  const vault = firstSet(args.vault, env.SECOND_BRAIN_VAULT, file.vault);
  if (!vault) {
    throw new ConfigError(
      [
        'No vault is configured. Set it in one of three ways:',
        '  brain <command> --vault <path>   for one command',
        '  SECOND_BRAIN_VAULT=<path>        in the environment',
        `  brain init --vault <path>        to save it in ${file.path}`,
      ].join('\n'),
    );
  }
  return {
    vault: expandPath(vault, input),
    model: firstSet(args.model, env.SECOND_BRAIN_MODEL, file.model) ?? DEFAULTS.model,
    ollamaUrl: firstSet(env.SECOND_BRAIN_OLLAMA_URL, file.ollama_url) ?? DEFAULTS.ollamaUrl,
    excludes: file.excludes ?? DEFAULTS.excludes,
  };
}

/** `$XDG_CONFIG_HOME/brain/config.json`, defaulting to `~/.config`. */
export function configPath(env: Env, home: string, platform: NodeJS.Platform): string {
  const p = pathFor(platform);
  return p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), 'brain', 'config.json');
}

/** `$XDG_DATA_HOME`, else `%LOCALAPPDATA%` (Windows), else the platform default. */
export function dataDir(env: Env, home: string, platform: NodeJS.Platform): string {
  const p = pathFor(platform);
  if (env.XDG_DATA_HOME) return env.XDG_DATA_HOME;
  if (platform === 'win32') return env.LOCALAPPDATA || p.join(home, 'AppData', 'Local');
  return p.join(home, '.local', 'share');
}

/** `<data-dir>/brain/<vault-id>`, where the id is derived from the vault's real path. */
export function indexDir(data: string, vaultRealPath: string, platform: NodeJS.Platform): string {
  const id = createHash('sha256').update(vaultRealPath).digest('hex').slice(0, 16);
  return pathFor(platform).join(data, 'brain', id);
}
