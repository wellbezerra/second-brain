// Pure rules behind the git hooks. No I/O here: the hook scripts feed data in.

export const MAX_FILE_BYTES = 20_000; // ≈ 5,000 tokens at 4 bytes per token

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
]);
const GENERATED_DIRS = ['dist/', 'coverage/', 'tests/fixtures/'];
const GENERATED_SUFFIXES = ['.min.js', '.min.css', '.map', '.snap'];
const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'pdf',
  'zip',
  'gz',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'db',
  'sqlite',
  'wasm',
]);

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const extension = (path: string): string => {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
};

export function isBinaryPath(path: string): boolean {
  return BINARY_EXTENSIONS.has(extension(path));
}

/** Lockfiles, generated output, fixtures and binaries are not split by hand. */
export function isExemptFromSizeLimit(path: string): boolean {
  const name = basename(path);
  return (
    LOCKFILES.has(name) ||
    name.endsWith('.lock') ||
    name.includes('.generated.') ||
    GENERATED_DIRS.some((dir) => path.startsWith(dir)) ||
    GENERATED_SUFFIXES.some((suffix) => name.endsWith(suffix)) ||
    isBinaryPath(path)
  );
}

export function sizeViolation(path: string, bytes: number): string | null {
  if (bytes <= MAX_FILE_BYTES || isExemptFromSizeLimit(path)) return null;
  return [
    `${path} is ${bytes.toLocaleString('en-US')} bytes; the limit is ${MAX_FILE_BYTES.toLocaleString('en-US')} (about 5,000 tokens).`,
    '  A file this size is hard for a person or an agent to hold in mind at once. To split it:',
    '  - find the two or three responsibilities it mixes and give each its own module;',
    '  - move pure helpers and types next to the code that uses them most;',
    '  - for a test file, split by behaviour under test (one file per public function or command);',
    '  - for docs, keep the overview here and move each section into its own file, linked from it.',
    '  Then re-export from the original path if callers should not change.',
  ].join('\n');
}

export function isEnvFile(path: string): boolean {
  return /^\.env(\..*)?$/.test(basename(path));
}

const ALLOW_PRAGMA = 'harness:allow-secret';

const SECRET_RULES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/,
  },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe live key', pattern: /\b[sr]k_live_[0-9A-Za-z]{20,}/ },
  {
    name: 'hard-coded credential',
    pattern:
      /\b(?:api[_-]?key|secret|token|passw(?:or)?d|client[_-]?secret)\b["']?\s*[:=]\s*["'](?![^"']*(?:example|placeholder|changeme|xxx|<|\$\{))[^"'\s]{16,}["']/i,
  },
];

export type SecretFinding = { line: number; rule: string };

/** Lines carrying `harness:allow-secret` are skipped, for deliberate test data. */
export function findSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  text.split('\n').forEach((content, index) => {
    if (content.includes(ALLOW_PRAGMA)) return;
    for (const { name, pattern } of SECRET_RULES) {
      if (pattern.test(content)) {
        findings.push({ line: index + 1, rule: name });
        break;
      }
    }
  });
  return findings;
}

/** Replaces anything that looks like a secret, for text that goes into logs. */
export function redactSecrets(text: string): string {
  return SECRET_RULES.reduce(
    (acc, { pattern }) =>
      acc.replace(new RegExp(pattern.source, `${pattern.flags}g`), '[redacted]'),
    text,
  );
}

export const PROTECTED_BRANCH = 'main';

/** Parses pre-push stdin: `<local ref> <local sha> <remote ref> <remote sha>` per line. */
export function pushesToProtectedBranch(stdin: string): boolean {
  return stdin
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[2])
    .some((remoteRef) => remoteRef === `refs/heads/${PROTECTED_BRANCH}`);
}

const FORMATTABLE = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'mts',
  'cts',
  'json',
  'jsonc',
]);

export function isFormattable(path: string): boolean {
  return FORMATTABLE.has(extension(path)) && !isExemptFromSizeLimit(path);
}
