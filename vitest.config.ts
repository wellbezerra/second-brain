import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const fixtureVault = resolve(import.meta.dirname, 'tests', 'fixtures', 'vault');

export default defineConfig({
  test: {
    // Every test sees the fixture vault, whatever the developer's shell says.
    env: { SECOND_BRAIN_VAULT: fixtureVault },
    globalSetup: ['tests/setup/global-vault-guard.ts'],
    setupFiles: ['tests/setup/vault-guard.ts'],
    // The probe deliberately breaks the vault rule; only its own test runs it.
    exclude: process.env.VAULT_GUARD_PROBE
      ? ['**/node_modules/**']
      : ['**/node_modules/**', 'tests/setup/**'],
  },
});
