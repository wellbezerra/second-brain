import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands.js';

describe('parseCommand', () => {
  it('treats `brain --version` as a request for the version', () => {
    expect(parseCommand(['--version'])).toEqual({ kind: 'version' });
  });

  it('shows help when `brain` is called with no command', () => {
    expect(parseCommand([])).toEqual({ kind: 'help' });
  });

  it('reports a command it does not know by name', () => {
    expect(parseCommand(['frobnicate'])).toEqual({ kind: 'unknown', name: 'frobnicate' });
  });
});
