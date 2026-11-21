// End-to-end: the built `brain` command, as a user runs it. Every location
// Brain could write to points into a throwaway folder.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..');
const CLI = join(REPO, 'dist', 'cli.js');
const FIXTURE_VAULT = join(REPO, 'tests', 'fixtures', 'vault');

let root: string;

beforeAll(() => {
  if (!existsSync(CLI)) throw new Error('dist/cli.js is missing: run `npm run build` first.');
});

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'brain-cli-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function brain(args: string[], extraEnv: Record<string, string> = {}) {
  const { SECOND_BRAIN_FEATURES: _ignored, ...env } = process.env;
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: {
      ...env,
      HOME: join(root, 'home'),
      USERPROFILE: join(root, 'home'),
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_DATA_HOME: join(root, 'data'),
      LOCALAPPDATA: join(root, 'local'),
      SECOND_BRAIN_VAULT: FIXTURE_VAULT,
      ...extraEnv,
    },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('brain', () => {
  it('prints the package version', () => {
    const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(brain(['--version'])).toMatchObject({ code: 0, stdout: `${version}\n` });
  });

  it('still prints the version when the configuration file is broken', () => {
    mkdirSync(join(root, 'config', 'brain'), { recursive: true });
    writeFileSync(join(root, 'config', 'brain', 'config.json'), '{ broken');
    expect(brain(['--version']).code).toBe(0);
  });

  it('still prints help when the configuration path cannot be read', () => {
    mkdirSync(join(root, 'config', 'brain', 'config.json'), { recursive: true });
    expect(brain(['--help'])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining('Usage: brain'),
    });
    const r = brain(['init', '--vault', FIXTURE_VAULT], { SECOND_BRAIN_FEATURES: 'init' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(join(root, 'config', 'brain', 'config.json'));
  });

  it('keeps `brain init` behind its feature flag, and says how to turn it on', () => {
    const r = brain(['init', '--vault', FIXTURE_VAULT]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/SECOND_BRAIN_FEATURES=init/);
    expect(existsSync(join(root, 'config'))).toBe(false);
    expect(existsSync(join(root, 'data'))).toBe(false);
  });

  it('configures the vault with `brain init` and tells the user where the index lives', () => {
    const r = brain(['init', '--vault', FIXTURE_VAULT], { SECOND_BRAIN_FEATURES: 'init' });
    expect(r.code).toBe(0);
    const config = JSON.parse(
      readFileSync(join(root, 'config', 'brain', 'config.json'), 'utf8'),
    ) as { vault: string };
    expect(config.vault).toBe(realpathSync.native(FIXTURE_VAULT));
    expect(r.stdout).toContain(join(root, 'data', 'brain'));
    expect(r.stdout).toContain('brain index');
  });

  it('fails with a message and a non-zero exit when the vault does not exist', () => {
    const r = brain(['init', '--vault', join(root, 'missing')], { SECOND_BRAIN_FEATURES: 'init' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(join(root, 'missing'));
    expect(existsSync(join(root, 'data'))).toBe(false);
  });

  it('fails with usage help when `brain init` has no vault', () => {
    const r = brain(['init'], { SECOND_BRAIN_FEATURES: 'init' });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--vault/);
  });
});
