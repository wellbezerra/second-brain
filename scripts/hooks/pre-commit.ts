// Pre-commit: blocks commits on main, oversized files, .env files and secrets,
// then formats the staged code files. Looks at staged content only.

import { biome, currentBranch, git, gitBuffer, splitNul } from './git.ts';
import {
  findSecrets,
  isBinaryPath,
  isEnvFile,
  isFormattable,
  PROTECTED_BRANCH,
  sizeViolation,
} from './rules.ts';

const errors: string[] = [];

if (currentBranch() === PROTECTED_BRANCH) {
  errors.push(
    `Commits on ${PROTECTED_BRANCH} are blocked. Create a branch first: git switch -c <type>/<short-name>`,
  );
}

const staged = splitNul(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']));

for (const path of staged) {
  if (isEnvFile(path)) {
    errors.push(
      `${path}: .env files are never committed. Unstage it: git restore --staged ${path}`,
    );
    continue;
  }
  const blob = gitBuffer(['show', `:${path}`]);
  const violation = sizeViolation(path, blob.length);
  if (violation) errors.push(violation);
  if (isBinaryPath(path) || blob.subarray(0, 8000).includes(0)) continue;
  for (const finding of findSecrets(blob.toString('utf8'))) {
    errors.push(
      `${path}:${finding.line}: looks like a ${finding.rule}. Remove it and load it from the environment instead.`,
    );
  }
}

if (errors.length === 0) {
  const toFormat = staged.filter(isFormattable);
  const partiallyStaged = new Set(splitNul(git(['diff', '--name-only', '-z'])));
  const safeToRewrite = toFormat.filter((path) => !partiallyStaged.has(path));
  const checkOnly = toFormat.filter((path) => partiallyStaged.has(path));

  if (safeToRewrite.length > 0) {
    if (biome(['format', '--write', '--no-errors-on-unmatched', ...safeToRewrite]) !== 0) {
      errors.push('Biome could not format the staged files (see above).');
    } else {
      git(['add', '--', ...safeToRewrite]);
    }
  }
  if (checkOnly.length > 0 && biome(['format', '--no-errors-on-unmatched', ...checkOnly]) !== 0) {
    errors.push(
      'These files have unstaged changes, so they were not formatted automatically. Run `npm run format`, stage, and commit again.',
    );
  }
}

if (errors.length > 0) {
  console.error(`\npre-commit blocked this commit:\n\n${errors.join('\n\n')}\n`);
  process.exit(1);
}
