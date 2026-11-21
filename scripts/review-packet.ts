// Writes .harness/review/<branch>.md: the spec and the branch diff, nothing
// else, for a reviewer in a fresh session.
// Usage: node scripts/review-packet.ts [docs/specs/NN-name.md]

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { buildPacket, packetPath, type Spec, specViolation } from './review-packet-format.ts';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
}

function fail(message: string): never {
  console.error(`review-packet: ${message}`);
  process.exit(1);
}

function hasRef(ref: string): boolean {
  try {
    git('rev-parse', '--verify', '--quiet', ref);
    return true;
  } catch {
    return false;
  }
}

const root = git('rev-parse', '--show-toplevel');
process.chdir(root);

const branch = git('branch', '--show-current');
if (branch === '') fail('HEAD is detached; check out the branch to review.');
if (branch === 'main') fail('you are on main; the packet reviews a branch against main.');
if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  fail('there are uncommitted changes, which the packet would leave out. Commit them first.');
}

// origin/main when it exists, so a stale local main does not drag merged work in.
const base = hasRef('origin/main') ? 'origin/main' : 'main';
const diff = git('diff', '--no-color', `${base}...HEAD`);
if (diff === '') fail(`the branch has no changes against ${base}.`);

let spec: Spec | null = null;
const specArg = process.argv[2];
if (specArg) {
  const violation = specViolation(root, specArg);
  if (violation) fail(violation);
  try {
    spec = { path: specArg.replaceAll('\\', '/'), text: readFileSync(specArg, 'utf8') };
  } catch {
    fail(`cannot read ${specArg}.`);
  }
}

const out = packetPath(root, branch);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buildPacket({ branch, base, spec, diff }));
console.log(relative(root, out).replaceAll('\\', '/'));
