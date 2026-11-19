// Probe for the vault guard: points the vault outside the repository.
// Excluded from normal runs; tests/integration/vault-guard.test.ts runs it and
// expects the whole run to fail.

import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';

it('tries to use a vault outside the repository', () => {
  process.env.SECOND_BRAIN_VAULT = tmpdir();
  expect(true).toBe(true);
});
