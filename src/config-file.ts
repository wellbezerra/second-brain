// Reads the configuration file from disk. A missing file is not an error.

import { readFileSync } from 'node:fs';
import type { ConfigFileSource } from './config.js';

export function readConfigFile(path: string): ConfigFileSource {
  try {
    return { path, contents: readFileSync(path, 'utf8') };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, contents: null };
    throw error;
  }
}
