import { describe, expect, it } from 'vitest';
import {
  findSecrets,
  isEnvFile,
  isExemptFromSizeLimit,
  MAX_FILE_BYTES,
  pushesToProtectedBranch,
  redactSecrets,
  sizeViolation,
} from '../../../scripts/hooks/rules.ts';

// Fake credentials are assembled at runtime so this file never contains one.
const awsKey = `AKIA${'ABCDEFGHIJKLMNOP'}`;
const githubToken = `ghp_${'a'.repeat(36)}`;

describe('file size limit', () => {
  it('rejects a 25,000-byte source file and explains how to split it', () => {
    const message = sizeViolation('src/search.ts', 25_000);
    expect(message).toContain('25,000 bytes');
    expect(message).toContain('responsibilities');
  });

  it('accepts a file exactly at the limit', () => {
    expect(sizeViolation('src/search.ts', MAX_FILE_BYTES)).toBeNull();
  });

  it.each([
    'package-lock.json',
    'tests/fixtures/vault/long-note.md',
    'dist/cli.js',
    'docs/diagram.png',
  ])('does not apply to %s', (path) => {
    expect(isExemptFromSizeLimit(path)).toBe(true);
  });
});

describe('.env files', () => {
  it.each(['.env', 'config/.env.local', '.env.production'])('recognises %s', (path) => {
    expect(isEnvFile(path)).toBe(true);
  });

  it('does not mistake a module named env.ts for one', () => {
    expect(isEnvFile('src/env.ts')).toBe(false);
  });
});

describe('secret scan', () => {
  it('reports the line of an AWS access key', () => {
    expect(findSecrets(`const a = 1;\nconst key = '${awsKey}';`)).toEqual([
      { line: 2, rule: 'AWS access key' },
    ]);
  });

  it('finds a GitHub token, a private key and a hard-coded password', () => {
    const text = [
      githubToken,
      `-----BEGIN RSA ${'PRIVATE'} KEY-----`,
      `password = "${'s3cr3t-'.repeat(3)}"`,
    ].join('\n');
    expect(findSecrets(text).map((f) => f.rule)).toEqual([
      'GitHub token',
      'private key',
      'hard-coded credential',
    ]);
  });

  it('ignores placeholders and lines marked as deliberate test data', () => {
    const text = [
      `api_key = "<your-api-key-goes-here>"`,
      `token: "${'x'.repeat(20)}example"`,
      `${awsKey} // harness:allow-secret`,
    ].join('\n');
    expect(findSecrets(text)).toEqual([]);
  });

  it('redacts secrets from text bound for a log', () => {
    expect(redactSecrets(`curl -H "Authorization: ${githubToken}"`)).toBe(
      'curl -H "Authorization: [redacted]"',
    );
  });
});

describe('push protection', () => {
  it('detects a push to main', () => {
    expect(pushesToProtectedBranch('refs/heads/x abc refs/heads/main def\n')).toBe(true);
  });

  it('lets a feature branch through', () => {
    expect(pushesToProtectedBranch('refs/heads/feat/a abc refs/heads/feat/a def\n')).toBe(false);
  });
});
