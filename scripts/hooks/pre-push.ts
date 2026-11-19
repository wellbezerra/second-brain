// Pre-push: blocks pushes to main, then runs the fast gate.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PROTECTED_BRANCH, pushesToProtectedBranch } from './rules.ts';

const stdin = readFileSync(0, 'utf8');

if (pushesToProtectedBranch(stdin)) {
  console.error(
    `\npre-push blocked this push: ${PROTECTED_BRANCH} only changes through a pull request.\n`,
  );
  process.exit(1);
}

const check = spawnSync('npm run check:fast', { stdio: 'inherit', shell: true });
if (check.status !== 0) {
  console.error('\npre-push blocked this push: `make check-fast` failed (see above).\n');
  process.exit(1);
}
