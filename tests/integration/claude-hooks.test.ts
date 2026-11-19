// Runs the Claude Code hook scripts as real processes, the way Claude Code does.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HOOKS = resolve(import.meta.dirname, '..', '..', '.claude', 'hooks');
let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'project-'));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

function runHook(script: string, input: object, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', join(HOOKS, script), ...args],
    {
      input: JSON.stringify({ cwd: project, ...input }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: project, SECOND_BRAIN_VAULT: `${project}-vault` },
    },
  );
  return { code: result.status, stdout: result.stdout };
}

function logLines() {
  const dir = join(project, '.harness', 'sessions');
  return readdirSync(dir).flatMap((file) =>
    readFileSync(join(dir, file), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  );
}

describe('guard hook', { timeout: 30_000 }, () => {
  it('denies a write outside the repository and logs it as blocked', () => {
    const outside = join(project, '..', 'elsewhere.txt');
    const result = runHook('guard.ts', { tool_name: 'Write', tool_input: { file_path: outside } });

    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(logLines()).toEqual([
      expect.objectContaining({ tool: 'Write', target: outside, outcome: 'blocked' }),
    ]);
  });

  it('denies a write into the vault', () => {
    const note = join(`${project}-vault`, 'Journal', 'today.md');
    const result = runHook('guard.ts', { tool_name: 'Edit', tool_input: { file_path: note } });
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason).toContain(
      'inside the vault',
    );
  });

  it('stays silent for a write inside the repository', () => {
    const inside = join(project, 'src', 'a.ts');
    const result = runHook('guard.ts', { tool_name: 'Write', tool_input: { file_path: inside } });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('log hook', { timeout: 30_000 }, () => {
  it('appends one JSON line per tool call with timestamp, tool, target and outcome', () => {
    runHook('log.ts', { tool_name: 'Read', tool_input: { file_path: 'a.md' } }, 'ok');
    runHook('log.ts', { tool_name: 'Bash', tool_input: { command: 'npm test' } }, 'error');

    const lines = logLines();
    expect(lines.map(({ tool, target, outcome }) => ({ tool, target, outcome }))).toEqual([
      { tool: 'Read', target: 'a.md', outcome: 'ok' },
      { tool: 'Bash', target: 'npm test', outcome: 'error' },
    ]);
    expect(Number.isNaN(Date.parse(lines[0].timestamp))).toBe(false);
  });
});
