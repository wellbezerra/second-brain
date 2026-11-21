// Reads the configuration file from disk. A missing file is not an error; a
// file that exists but cannot be read is a ConfigError naming it.

import { readFileSync } from 'node:fs';
import { ConfigError, type ConfigFileSource } from './config.js';

export function readConfigFile(path: string): ConfigFileSource {
  try {
    return { path, contents: readFileSync(path, 'utf8') };
  } catch (error) {
    const { code, message } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT') return { path, contents: null };
    throw new ConfigError(`Cannot read ${path}: ${code ?? message}`);
  }
}
