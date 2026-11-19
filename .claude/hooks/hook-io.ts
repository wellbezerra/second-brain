// Shared plumbing for the Claude Code hooks: stdin parsing and the session log.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactSecrets } from '../../scripts/hooks/rules.ts';

export type HookInput = {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
};

export function readInput(): HookInput {
  const raw = readFileSync(0, 'utf8');
  return raw.trim() === '' ? {} : (JSON.parse(raw) as HookInput);
}

export function repoRootOf(input: HookInput): string {
  return process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
}

const TARGET_KEYS = ['file_path', 'notebook_path', 'path', 'url', 'pattern', 'command', 'query'];

export function targetOf(input: HookInput): string {
  const toolInput = input.tool_input ?? {};
  const key = TARGET_KEYS.find((k) => typeof toolInput[k] === 'string');
  const value = key ? String(toolInput[key]) : '';
  return redactSecrets(value.replace(/\s+/g, ' ').slice(0, 300));
}

export type Outcome = 'ok' | 'error' | 'denied' | 'blocked';

/** Appends one JSON line to .harness/sessions/YYYY-MM-DD.jsonl (UTC date). */
export function logToolCall(input: HookInput, outcome: Outcome): void {
  const now = new Date();
  const dir = join(repoRootOf(input), '.harness', 'sessions');
  mkdirSync(dir, { recursive: true });
  const line = {
    timestamp: now.toISOString(),
    tool: input.tool_name ?? 'unknown',
    target: targetOf(input),
    outcome,
  };
  appendFileSync(join(dir, `${now.toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify(line)}\n`);
}
