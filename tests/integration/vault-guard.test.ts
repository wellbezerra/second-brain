// Proves the vault guard: a test that points SECOND_BRAIN_VAULT outside the
// repository makes the run fail, and normal tests see the fixture vault.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');

describe('vault guard', { timeout: 60_000 }, () => {
  it('points every test at the fixture vault', () => {
    expect(process.env.SECOND_BRAIN_VAULT).toBe(resolve(ROOT, 'tests', 'fixtures', 'vault'));
  });

  it('fails the run when a test points the vault outside the repository', () => {
    const result = spawnSync('npx vitest run tests/setup/probes', {
      cwd: ROOT,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, VAULT_GUARD_PROBE: '1' },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('outside the repository');
  });
});
