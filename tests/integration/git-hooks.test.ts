// Exercises the real git hooks against a throwaway repository.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HOOKS = resolve(import.meta.dirname, '..', '..', 'scripts', 'hooks');
let repo: string;

function git(...args: string[]) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'hooks-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README.md'), '# test\n');
  git('add', '.');
  git('commit', '-q', '--no-verify', '-m', 'chore: root');
  git('config', 'core.hooksPath', HOOKS);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

function commitFile(name: string, content: string) {
  writeFileSync(join(repo, name), content);
  git('add', name);
  return git('commit', '-m', `chore: add ${name}`);
}

describe('pre-commit', { timeout: 60_000 }, () => {
  it('blocks a commit on main', () => {
    const result = commitFile('a.txt', 'hello\n');
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('Commits on main are blocked');
  });

  describe('on a feature branch', () => {
    beforeEach(() => git('switch', '-q', '-c', 'feat/x'));

    it('blocks a 25,000-byte TypeScript file and explains how to split it', () => {
      const result = commitFile('big.ts', `// ${'x'.repeat(24_996)}\n`);
      expect(result.code).not.toBe(0);
      expect(result.out).toContain('25,000 bytes');
      expect(result.out).toContain('To split it');
    });

    it('blocks any .env file', () => {
      const result = commitFile('.env', 'X=1\n');
      expect(result.code).not.toBe(0);
      expect(result.out).toContain('.env files are never committed');
    });

    it('blocks a committed secret and names the line', () => {
      const result = commitFile('config.ts', `export const k = '${'AKIA'}${'Q'.repeat(16)}';\n`);
      expect(result.code).not.toBe(0);
      expect(result.out).toContain('config.ts:1: looks like a AWS access key');
    });

    it('accepts a small change and commits it formatted', () => {
      const result = commitFile('ok.ts', 'const  a=1\n');
      expect(result.code).toBe(0);
      expect(git('show', 'HEAD:ok.ts').out).toBe('const a = 1;\n');
    });
  });
});

describe('pre-push', { timeout: 60_000 }, () => {
  it('blocks a push to main', () => {
    const remote = mkdtempSync(join(tmpdir(), 'remote-'));
    try {
      spawnSync('git', ['init', '-q', '--bare', remote]);
      git('remote', 'add', 'origin', remote);
      const result = git('push', 'origin', 'main');
      expect(result.code).not.toBe(0);
      expect(result.out).toContain('main only changes through a pull request');
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });
});
