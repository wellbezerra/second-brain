// Turns command-line arguments into a request. Pure: no I/O, no process access.

import { parseArgs } from 'node:util';

export type Command =
  | { kind: 'version' }
  | { kind: 'help' }
  | { kind: 'init'; vault: string; model?: string }
  | { kind: 'usage'; message: string }
  | { kind: 'unknown'; name: string };

export const INIT_USAGE = 'Usage: brain init --vault <path> [--model <name>]';

export function parseCommand(argv: readonly string[]): Command {
  const [first, ...rest] = argv;
  if (first === undefined || first === '--help' || first === '-h') return { kind: 'help' };
  if (first === '--version' || first === '-v') return { kind: 'version' };
  if (first === 'init') return parseInit(rest);
  return { kind: 'unknown', name: first };
}

function parseInit(args: string[]): Command {
  let values: { vault?: string | undefined; model?: string | undefined };
  try {
    ({ values } = parseArgs({
      args,
      options: { vault: { type: 'string' }, model: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { kind: 'usage', message: `brain init: ${(error as Error).message}\n${INIT_USAGE}` };
  }
  if (!values.vault) return { kind: 'usage', message: `brain init needs --vault.\n${INIT_USAGE}` };
  return values.model
    ? { kind: 'init', vault: values.vault, model: values.model }
    : { kind: 'init', vault: values.vault };
}
