// The package version, read from package.json (one level above src/ and dist/).

import { readFileSync } from 'node:fs';

export function version(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}
