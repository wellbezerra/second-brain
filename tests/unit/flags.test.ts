import { describe, expect, it } from 'vitest';
import { resolveFlags } from '../../src/flags.js';

describe('resolveFlags', () => {
  it('keeps every feature off by default', () => {
    expect(resolveFlags(undefined, undefined)).toEqual({ init: false });
  });

  it('turns a feature on from the configuration file', () => {
    expect(resolveFlags(['init'], undefined)).toEqual({ init: true });
  });

  it('lets the environment turn a feature on or off over the file', () => {
    expect(resolveFlags(undefined, 'init')).toEqual({ init: true });
    expect(resolveFlags(['init'], ' -init ')).toEqual({ init: false });
  });

  it('ignores names that are not features', () => {
    expect(resolveFlags(['nope'], 'other,,')).toEqual({ init: false });
  });
});
