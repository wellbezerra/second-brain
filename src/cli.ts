#!/usr/bin/env node
// The only module allowed to print, read stdin or exit the process.

import { readFileSync } from 'node:fs';
import { parseCommand } from './commands.js';

const HELP = `Usage: brain <command>

Options:
  -h, --help       show this help
  -v, --version    print the version`;

function readVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}

const command = parseCommand(process.argv.slice(2));
switch (command.kind) {
  case 'version':
    console.log(readVersion());
    break;
  case 'help':
    console.log(HELP);
    break;
  case 'unknown':
    console.error(`brain: unknown command '${command.name}'\n\n${HELP}`);
    process.exit(2);
}
