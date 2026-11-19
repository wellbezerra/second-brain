// Runs the real review-packet script against a throwaway repository.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '..', '..', 'scripts', 'review-packet.ts');
let repo: string;

function git(...args: string[]) {
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function packet(...args: string[]) {
  const r = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', SCRIPT, ...args],
    { cwd: repo, encoding: 'utf8' },
  );
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function commit(file: string, content: string) {
  mkdirSync(join(repo, file, '..'), { recursive: true });
  writeFileSync(join(repo, file), content);
  git('add', file);
  git('commit', '-q', '--no-verify', '-m', `chore: ${file}`);
}

const packetFile = () => join(repo, '.harness', 'review', 'feat', 'thing.md');

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'packet-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, '.gitignore'), '.harness/\n');
  commit('docs/specs/01-thing.md', '# Spec 01 — thing\n\n- [ ] the thing works\n');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('review-packet', { timeout: 30_000 }, () => {
  it('writes the spec and the branch diff to .harness/review/<branch>.md', () => {
    git('switch', '-q', '-c', 'feat/thing');
    commit('src/thing.ts', 'export const thing = 42;\n');

    const result = packet('docs/specs/01-thing.md');

    expect(result.code).toBe(0);
    const text = readFileSync(packetFile(), 'utf8');
    expect(text).toContain('- [ ] the thing works');
    expect(text).toContain('+export const thing = 42;');
  });

  it('refuses to run on main and writes nothing', () => {
    commit('src/thing.ts', 'export const thing = 42;\n');
    expect(packet().code).not.toBe(0);
    expect(existsSync(join(repo, '.harness'))).toBe(false);
  });

  it('refuses a branch with nothing to review and writes nothing', () => {
    git('switch', '-q', '-c', 'feat/thing');
    expect(packet().code).not.toBe(0);
    expect(existsSync(packetFile())).toBe(false);
  });

  it('refuses uncommitted changes, which the packet would leave out', () => {
    git('switch', '-q', '-c', 'feat/thing');
    commit('src/thing.ts', 'export const thing = 42;\n');
    writeFileSync(join(repo, 'src', 'thing.ts'), 'export const thing = 43;\n');
    expect(packet().code).not.toBe(0);
    expect(existsSync(packetFile())).toBe(false);
  });
});
