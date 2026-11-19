// PostToolUse / PostToolUseFailure / PermissionDenied: one JSON line per tool call.
// Usage: node log.ts <ok|error|denied>

import { logToolCall, type Outcome, readInput } from './hook-io.ts';

const outcome = (process.argv[2] ?? 'ok') as Outcome;

try {
  logToolCall(readInput(), outcome);
} catch (error) {
  console.error(`harness log hook failed: ${String(error)}`);
}
