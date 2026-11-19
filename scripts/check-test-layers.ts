// Enforces the unit layer: a unit test touches no disk, no network and no
// database. Fails check-fast when a file under tests/unit imports one of them.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const UNIT_DIR = join(ROOT, 'tests', 'unit');

const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/from ['"](?:node:)?fs(?:\/promises)?['"]/, 'the file system'],
  [/from ['"](?:node:)?(?:net|http|https|http2|dgram|tls|dns)['"]/, 'the network'],
  [/from ['"](?:node:)?child_process['"]/, 'child processes'],
  [/from ['"](?:better-sqlite3|sqlite-vec|node:sqlite)['"]/, 'a database'],
  [/\bfetch\s*\(/, 'the network (fetch)'],
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}

const violations = files(UNIT_DIR).flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return FORBIDDEN.filter(([pattern]) => pattern.test(source)).map(
    ([, what]) => `${relative(ROOT, file)} uses ${what}`,
  );
});

if (violations.length > 0) {
  console.error(
    `Unit tests must not touch disk, network or a database:\n  ${violations.join('\n  ')}\n` +
      'Move the test to tests/integration/, or test a pure function instead.',
  );
  process.exit(1);
}
