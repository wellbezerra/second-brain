// Loaded into every test file: checks SECOND_BRAIN_VAULT on load, before each
// test and after each test, so a test that points it elsewhere fails the run.

import { afterEach, beforeEach } from 'vitest';
import { vaultViolation } from './vault-path.ts';

function assertSafeVault(): void {
  const violation = vaultViolation(process.env.SECOND_BRAIN_VAULT);
  if (violation) throw new Error(`Vault guard: ${violation}`);
}

assertSafeVault();
beforeEach(assertSafeVault);
afterEach(assertSafeVault);
