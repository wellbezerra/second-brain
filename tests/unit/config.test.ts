import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  configPath,
  DEFAULTS,
  dataDir,
  indexDir,
  parseConfigFile,
  resolveConfig,
} from '../../src/config.js';

const posixCtx = { home: '/home/ana', cwd: '/home/ana/work', platform: 'linux' as const };
const noFile = parseConfigFile({ path: '/home/ana/.config/brain/config.json', contents: null });

function fileWith(json: object) {
  return parseConfigFile({ path: '/cfg/config.json', contents: JSON.stringify(json) });
}

describe('resolveConfig', () => {
  it('lets the command-line argument beat the environment, the file and the default', () => {
    const config = resolveConfig({
      ...posixCtx,
      args: { vault: '/from/arg', model: 'arg-model' },
      env: { SECOND_BRAIN_VAULT: '/from/env', SECOND_BRAIN_MODEL: 'env-model' },
      file: fileWith({ vault: '/from/file', model: 'file-model' }),
    });
    expect(config.vault).toBe('/from/arg');
    expect(config.model).toBe('arg-model');
  });

  it('lets the environment beat the file', () => {
    const config = resolveConfig({
      ...posixCtx,
      args: {},
      env: {
        SECOND_BRAIN_VAULT: '/from/env',
        SECOND_BRAIN_MODEL: 'env-model',
        SECOND_BRAIN_OLLAMA_URL: 'http://env:1',
      },
      file: fileWith({ vault: '/from/file', model: 'file-model', ollama_url: 'http://file:1' }),
    });
    expect(config).toMatchObject({
      vault: '/from/env',
      model: 'env-model',
      ollamaUrl: 'http://env:1',
    });
  });

  it('lets the file beat the defaults', () => {
    const config = resolveConfig({
      ...posixCtx,
      args: {},
      env: {},
      file: fileWith({
        vault: '/from/file',
        model: 'file-model',
        ollama_url: 'http://file:1',
        excludes: ['private'],
      }),
    });
    expect(config).toMatchObject({
      vault: '/from/file',
      model: 'file-model',
      ollamaUrl: 'http://file:1',
      excludes: ['private'],
    });
  });

  it('uses the defaults when there is no configuration file', () => {
    const config = resolveConfig({ ...posixCtx, args: { vault: '/v' }, env: {}, file: noFile });
    expect(config).toEqual({ vault: '/v', ...DEFAULTS });
    expect(DEFAULTS).toEqual({
      model: 'bge-m3',
      ollamaUrl: 'http://127.0.0.1:11434',
      excludes: ['.obsidian', '.trash', '.git', 'node_modules'],
    });
  });

  it('expands ~ and makes a relative vault path absolute', () => {
    const at = (vault: string) =>
      resolveConfig({ ...posixCtx, args: { vault }, env: {}, file: noFile }).vault;
    expect(at('~/notes')).toBe('/home/ana/notes');
    expect(at('~')).toBe('/home/ana');
    expect(at('notes/')).toBe('/home/ana/work/notes');
  });

  it('expands ~ with Windows paths on Windows', () => {
    const config = resolveConfig({
      home: 'C:\\Users\\ana',
      cwd: 'C:\\work',
      platform: 'win32',
      args: { vault: '~\\notes' },
      env: {},
      file: noFile,
    });
    expect(config.vault).toBe('C:\\Users\\ana\\notes');
  });

  it('fails with ConfigError naming all three fixes when no vault is configured', () => {
    const resolve = () => resolveConfig({ ...posixCtx, args: {}, env: {}, file: noFile });
    expect(resolve).toThrow(ConfigError);
    expect(resolve).toThrow(/--vault/);
    expect(resolve).toThrow(/SECOND_BRAIN_VAULT/);
    expect(resolve).toThrow(/brain init/);
  });
});

describe('parseConfigFile', () => {
  it('names the file when its JSON is invalid', () => {
    const parse = () => parseConfigFile({ path: '/cfg/config.json', contents: '{ vault: ' });
    expect(parse).toThrow(ConfigError);
    expect(parse).toThrow('/cfg/config.json');
  });

  it('names the file and the field when a field has the wrong type', () => {
    expect(() => fileWith({ vault: 123 })).toThrow(ConfigError);
    expect(() => fileWith({ excludes: 'private' })).toThrow(/excludes.*\/cfg\/config\.json/);
  });

  it('rejects a file whose top level is not an object', () => {
    expect(() => parseConfigFile({ path: '/cfg/config.json', contents: '[]' })).toThrow(
      ConfigError,
    );
  });
});

describe('configPath', () => {
  it('lives under ~/.config unless XDG_CONFIG_HOME says otherwise', () => {
    expect(configPath({}, '/home/ana', 'linux')).toBe('/home/ana/.config/brain/config.json');
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/ana', 'linux')).toBe(
      '/xdg/brain/config.json',
    );
  });
});

describe('dataDir and indexDir', () => {
  it('prefers XDG_DATA_HOME on any platform', () => {
    expect(dataDir({ XDG_DATA_HOME: '/xdg' }, '/home/ana', 'linux')).toBe('/xdg');
    expect(dataDir({ XDG_DATA_HOME: 'D:\\xdg', LOCALAPPDATA: 'C:\\L' }, 'C:\\U', 'win32')).toBe(
      'D:\\xdg',
    );
  });

  it('uses %LOCALAPPDATA% on Windows, falling back to the home AppData folder', () => {
    expect(dataDir({ LOCALAPPDATA: 'C:\\L' }, 'C:\\Users\\ana', 'win32')).toBe('C:\\L');
    expect(dataDir({}, 'C:\\Users\\ana', 'win32')).toBe('C:\\Users\\ana\\AppData\\Local');
  });

  it('uses ~/.local/share elsewhere', () => {
    expect(dataDir({}, '/home/ana', 'darwin')).toBe('/home/ana/.local/share');
  });

  it('puts each vault in its own folder named by a 16-character id', () => {
    const dir = indexDir('/data', '/home/ana/notes', 'linux');
    expect(dir).toMatch(/^\/data\/brain\/[0-9a-f]{16}$/);
    expect(indexDir('/data', '/home/ana/other', 'linux')).not.toBe(dir);
  });
});
