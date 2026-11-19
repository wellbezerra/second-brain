// Runs once before any test: aborts the whole run if the fixture vault would
// resolve outside the repository (for example through a symlink).

import { resolve } from 'node:path';
import { vaultViolation } from './vault-path.ts';

export default function setup(): void {
  const fixtureVault = resolve(import.meta.dirname, '..', 'fixtures', 'vault');
  process.env.SECOND_BRAIN_VAULT = fixtureVault;
  const violation = vaultViolation(fixtureVault);
  if (violation) throw new Error(`Refusing to run tests: ${violation}`);
}
