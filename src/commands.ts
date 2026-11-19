// Turns command-line arguments into a request. Pure: no I/O, no process access.

export type Command = { kind: 'version' } | { kind: 'help' } | { kind: 'unknown'; name: string };

export function parseCommand(argv: readonly string[]): Command {
  const [first] = argv;
  if (first === undefined || first === '--help' || first === '-h') return { kind: 'help' };
  if (first === '--version' || first === '-v') return { kind: 'version' };
  return { kind: 'unknown', name: first };
}
