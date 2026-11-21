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

  it('reads the vault and the optional model for `brain init`', () => {
    expect(parseCommand(['init', '--vault', '~/notes'])).toEqual({
      kind: 'init',
      vault: '~/notes',
    });
    expect(parseCommand(['init', '--vault=~/notes', '--model', 'nomic-embed-text'])).toEqual({
      kind: 'init',
      vault: '~/notes',
      model: 'nomic-embed-text',
    });
  });

  it('explains how to call `brain init` when the vault is missing or an option is unknown', () => {
    expect(parseCommand(['init'])).toMatchObject({ kind: 'usage', message: /--vault/ });
    expect(parseCommand(['init', '--vault', 'v', '--force'])).toMatchObject({ kind: 'usage' });
  });
});
