// PreToolUse: blocks writes outside the repository or into the vault, force
// pushes, commits on main, skipped git hooks and anything touching .env files.

import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { logToolCall, readInput, repoRootOf } from './hook-io.ts';
import { type Context, checkBash, checkWrite } from './policy.ts';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

const input = readInput();
const tool = input.tool_name ?? '';
const toolInput = input.tool_input ?? {};

function context(): Context {
  const repoRoot = repoRootOf(input);
  const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    repoRoot,
    cwd: input.cwd ?? repoRoot,
    vault: process.env.SECOND_BRAIN_VAULT || undefined,
    tempDir: tmpdir(),
    home: homedir(),
    branch: branch.status === 0 ? branch.stdout.trim() : '',
    platform: process.platform,
  };
}

function decide(): string | null {
  if (FILE_TOOLS.has(tool)) {
    const target = toolInput.file_path ?? toolInput.notebook_path;
    return typeof target === 'string' ? checkWrite(target, context()) : null;
  }
  if (SHELL_TOOLS.has(tool) && typeof toolInput.command === 'string') {
    return checkBash(toolInput.command, context());
  }
  return null;
}

let reason: string | null;
try {
  reason = decide();
} catch (error) {
  // Fail closed for tools that can write; let read-only tools through.
  reason =
    FILE_TOOLS.has(tool) || SHELL_TOOLS.has(tool) ? `harness guard failed: ${String(error)}` : null;
}

if (reason) {
  logToolCall(input, 'blocked');
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}
