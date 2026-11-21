// Pure logic for the review packet: the spec and the branch diff, with the
// diff's new-file line numbers written in, so a reviewer can cite file:line.

import { isAbsolute, join, relative, resolve } from 'node:path';

export type Spec = { path: string; text: string };
export type PacketInput = { branch: string; base: string; spec: Spec | null; diff: string };

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const WIDTH = 4;

/** Prefixes kept and added lines with their line number in the new file. */
export function numberDiff(diff: string): string {
  let next: number | null = null;
  return diff
    .split('\n')
    .map((line) => {
      const hunk = HUNK.exec(line);
      if (hunk) {
        next = Number(hunk[1]);
        return line;
      }
      if (line.startsWith('diff --git ')) next = null;
      if (next === null || line.startsWith('\\')) return line;
      if (line.startsWith('-')) return `${' '.repeat(WIDTH)} ${line}`;
      const label = String(next).padStart(WIDTH);
      next += 1;
      return `${label} ${line}`;
    })
    .join('\n');
}

function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(6, longest + 1));
}

export function buildPacket({ branch, base, spec, diff }: PacketInput): string {
  const body = numberDiff(diff.replaceAll('\r\n', '\n').trimEnd());
  const fence = fenceFor(body);
  const specSection = spec
    ? `## Spec — ${spec.path}\n\n${spec.text.replaceAll('\r\n', '\n').trim()}`
    : 'No spec: this change is a chore. Check it against the repository rules only.';
  return [
    `# Review packet — ${branch}`,
    '',
    'Diff lines are labelled with their line number in the new file.',
    '',
    specSection,
    '',
    `## Diff — ${base}...${branch}`,
    '',
    `${fence}diff`,
    body,
    fence,
    '',
  ].join('\n');
}

/** Where the packet for a branch is written; slashes become folders. */
export function packetPath(root: string, branch: string): string {
  return `${join(root, '.harness', 'review', ...branch.split('/'))}.md`;
}

/** Returns why a spec path is not acceptable, or null when it is. */
export function specViolation(root: string, specPath: string): string | null {
  const specs = resolve(root, 'docs', 'specs');
  const rel = relative(specs, resolve(root, specPath));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || !rel.endsWith('.md')) {
    return `${specPath} is not a spec: pass a Markdown file inside docs/specs/.`;
  }
  return null;
}
