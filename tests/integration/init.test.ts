// `brain init` against real directories: a throwaway home, config and data
// directory, plus the fixture vault, which must come out byte-identical.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config.js';
import { InitError, init } from '../../src/init.js';

const FIXTURE_VAULT = resolve(import.meta.dirname, '..', 'fixtures', 'vault');

let root: string;
let ctx: {
  home: string;
  cwd: string;
  platform: NodeJS.Platform;
  configPath: string;
  dataDir: string;
};

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'brain-init-')));
  ctx = {
    home: join(root, 'home'),
    cwd: root,
    platform: process.platform,
    configPath: join(root, 'config', 'brain', 'config.json'),
    dataDir: join(root, 'data'),
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function newVault(name = 'vault'): string {
  const vault = join(root, name);
  mkdirSync(vault);
  writeFileSync(join(vault, 'note.md'), '# Note\n');
  return vault;
}

/** Every path under dir with its type and, for files, a hash of its bytes. */
function snapshot(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .sort()
    .map((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return `${entry}/`;
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      return `${entry} ${hash}`;
    });
}

const readConfig = () =>
  JSON.parse(readFileSync(ctx.configPath, 'utf8')) as Record<string, unknown>;

describe('init', () => {
  it('fails on a path that does not exist and creates nothing', () => {
    expect(() => init({ vault: join(root, 'missing') }, ctx)).toThrow(InitError);
    expect(existsSync(join(root, 'missing'))).toBe(false);
    expect(existsSync(ctx.configPath)).toBe(false);
    expect(existsSync(ctx.dataDir)).toBe(false);
  });

  it('fails on a path that is a file, not a folder', () => {
    const file = join(root, 'note.md');
    writeFileSync(file, '# Not a vault\n');
    expect(() => init({ vault: file }, ctx)).toThrow(InitError);
    expect(existsSync(ctx.dataDir)).toBe(false);
  });

  it('records the vault in the index folder and in the configuration', () => {
    const vault = newVault();
    const result = init({ vault, model: 'nomic-embed-text' }, ctx);

    expect(result.vault).toBe(vault);
    expect(result.indexDir.startsWith(join(ctx.dataDir, 'brain') + sep)).toBe(true);
    expect(JSON.parse(readFileSync(join(result.indexDir, 'vault.json'), 'utf8'))).toEqual({
      vault,
    });
    expect(readConfig()).toEqual({ vault, model: 'nomic-embed-text' });
  });

  it('keeps unrelated settings already in the configuration', () => {
    mkdirSync(join(ctx.configPath, '..'), { recursive: true });
    writeFileSync(ctx.configPath, JSON.stringify({ excludes: ['private'], features: ['init'] }));
    const vault = newVault();
    init({ vault }, ctx);
    expect(readConfig()).toEqual({ excludes: ['private'], features: ['init'], vault });
  });

  it('refuses to overwrite a configuration file it cannot read, and names it', () => {
    mkdirSync(join(ctx.configPath, '..'), { recursive: true });
    writeFileSync(ctx.configPath, '{ broken');
    const vault = newVault();
    const run = () => init({ vault }, ctx);
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(ctx.configPath);
    expect(readFileSync(ctx.configPath, 'utf8')).toBe('{ broken');
    expect(existsSync(ctx.dataDir)).toBe(false);
  });

  it('names the configuration file when it exists but cannot be read', () => {
    mkdirSync(ctx.configPath, { recursive: true });
    const vault = newVault();
    const run = () => init({ vault }, ctx);
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(ctx.configPath);
    expect(existsSync(ctx.dataDir)).toBe(false);
  });

  it('refuses a vault that would hold its own index or configuration', () => {
    const vault = newVault();
    const before = snapshot(vault);
    expect(() => init({ vault }, { ...ctx, dataDir: join(vault, 'data') })).toThrow(InitError);
    expect(() =>
      init({ vault }, { ...ctx, configPath: join(vault, '.config', 'brain', 'config.json') }),
    ).toThrow(InitError);
    expect(() => init({ vault: root }, ctx)).toThrow(/inside the vault/);
    expect(() => init({ vault }, { ...ctx, dataDir: join(vault, '..data') })).toThrow(InitError);
    expect(snapshot(vault)).toEqual(before);
    expect(existsSync(ctx.dataDir)).toBe(false);
  });

  it('leaves the same state when run twice', () => {
    const vault = newVault();
    const first = init({ vault }, ctx);
    const after = { config: snapshot(join(ctx.configPath, '..')), data: snapshot(ctx.dataDir) };
    const second = init({ vault }, ctx);
    expect(second).toEqual(first);
    expect({ config: snapshot(join(ctx.configPath, '..')), data: snapshot(ctx.dataDir) }).toEqual(
      after,
    );
  });

  it('leaves the vault byte-identical', () => {
    const before = snapshot(FIXTURE_VAULT);
    init({ vault: FIXTURE_VAULT }, ctx);
    expect(snapshot(FIXTURE_VAULT)).toEqual(before);
  });

  it('maps two spellings of the same vault path to the same index', () => {
    const vault = newVault();
    const plain = init({ vault }, ctx).indexDir;
    expect(init({ vault: `${vault}${sep}` }, ctx).indexDir).toBe(plain);
    expect(init({ vault: relative(ctx.cwd, vault) }, ctx).indexDir).toBe(plain);
    if (process.platform === 'win32') {
      expect(init({ vault: vault.toUpperCase() }, ctx).indexDir).toBe(plain);
    }
  });

  it('maps a link to the vault to the same index as the vault itself', () => {
    const vault = newVault();
    const link = join(root, 'link');
    symlinkSync(vault, link, 'junction');
    try {
      const viaLink = init({ vault: link }, ctx);
      expect(viaLink.indexDir).toBe(init({ vault }, ctx).indexDir);
      expect(viaLink.vault).toBe(vault);
    } finally {
      unlinkSync(link);
    }
  });
});
