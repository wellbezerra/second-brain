// Shared check: SECOND_BRAIN_VAULT must resolve inside this repository.

import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const REPO_ROOT = realpathSync(resolve(import.meta.dirname, '..', '..'));

/** Returns why the configured vault is unsafe for tests, or null when it is safe. */
export function vaultViolation(vault: string | undefined): string | null {
  if (!vault) return 'SECOND_BRAIN_VAULT is not set during tests.';
  let real: string;
  try {
    real = realpathSync(vault);
  } catch {
    real = resolve(vault);
  }
  const rel = relative(REPO_ROOT, real);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return `SECOND_BRAIN_VAULT resolves to ${real}, outside the repository. Tests must never touch a real vault.`;
  }
  return null;
}
