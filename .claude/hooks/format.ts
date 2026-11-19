// PostToolUse on file edits: formats the edited file with the repository's Biome.

import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { biomeCommand } from '../../scripts/hooks/git.ts';
import { isFormattable } from '../../scripts/hooks/rules.ts';
import { readInput, repoRootOf } from './hook-io.ts';

try {
  const input = readInput();
  const target = input.tool_input?.file_path;
  const repoRoot = repoRootOf(input);
  if (typeof target === 'string') {
    const rel = relative(repoRoot, target).replaceAll('\\', '/');
    if (!rel.startsWith('..') && isFormattable(rel)) {
      spawnSync(biomeCommand(['format', '--write', '--no-errors-on-unmatched', target], repoRoot), {
        cwd: repoRoot,
        stdio: 'ignore',
        shell: true,
      });
    }
  }
} catch (error) {
  console.error(`harness format hook failed: ${String(error)}`);
}
