// Runs the real lock wrapper as concurrent processes.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RUNNER = resolve(import.meta.dirname, '..', '..', 'scripts', 'run-locked.ts');
let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'lock-'));
  // A job that records when it starts and ends, so overlap is visible.
  writeFileSync(
    join(work, 'job.cjs'),
    "const fs = require('fs'); const [log, id] = process.argv.slice(2);" +
      "fs.appendFileSync(log, 'start ' + id + '\\n');" +
      "setTimeout(() => fs.appendFileSync(log, 'end ' + id + '\\n'), 1200);",
  );
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

function runLocked(id: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        '--disable-warning=ExperimentalWarning',
        RUNNER,
        process.execPath,
        join(work, 'job.cjs'),
        join(work, 'log.txt'),
        id,
      ],
      {
        env: {
          ...process.env,
          SECOND_BRAIN_LOCK_DIR: join(work, 'locks'),
          SECOND_BRAIN_LOCK_POLL_MS: '100',
        },
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => done({ code, stderr }));
  });
}

describe('run-locked', { timeout: 30_000 }, () => {
  it('runs two heavy checks one after the other and tells the second its queue position', async () => {
    const first = runLocked('A');
    await new Promise((r) => setTimeout(r, 400));
    const second = runLocked('B');
    const [a, b] = await Promise.all([first, second]);

    expect([a.code, b.code]).toEqual([0, 0]);
    expect(b.stderr).toContain('queue position 1');
    expect(readFileSync(join(work, 'log.txt'), 'utf8')).toBe('start A\nend A\nstart B\nend B\n');
  });

  it('discards a lock left by a process that no longer exists', async () => {
    const locks = join(work, 'locks');
    await runLocked('warmup'); // creates the lock directory
    writeFileSync(join(locks, `${'0'.repeat(14)}1-2147483646.ticket`), '{}');

    const result = await runLocked('C');
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('discarded a stale lock');
  });
});
