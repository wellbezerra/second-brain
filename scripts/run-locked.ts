// Runs a command while holding the machine-wide check-full lock, so two heavy
// runs never compete for the same cores. Waiting runs print their position.
// Usage: node scripts/run-locked.ts <command> [args...]

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { queueState, TICKET_SUFFIX, ticketName } from './lock-queue.ts';

const dir = process.env.SECOND_BRAIN_LOCK_DIR ?? join(tmpdir(), 'second-brain-check-full');
const pollMs = Number(process.env.SECOND_BRAIN_LOCK_POLL_MS ?? 1_000);
const command = process.argv
  .slice(2)
  .map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
  .join(' ');

if (command === '') {
  console.error('usage: node scripts/run-locked.ts <command> [args...]');
  process.exit(2);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

mkdirSync(dir, { recursive: true });
const mine = ticketName(Date.now(), process.pid);
const ticketPath = join(dir, mine);
writeFileSync(ticketPath, JSON.stringify({ pid: process.pid, cwd: process.cwd() }), { flag: 'wx' });

const release = () => rmSync(ticketPath, { force: true });
process.on('exit', release);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    release();
    process.exit(130);
  });
}

let lastPosition = -1;
for (;;) {
  const files = readdirSync(dir).filter((name) => name.endsWith(TICKET_SUFFIX));
  const { position, stale } = queueState(files, mine, isAlive);
  for (const name of stale) {
    rmSync(join(dir, name), { force: true });
    console.error(`check-full: discarded a stale lock (${name})`);
  }
  if (position === 0) break;
  if (position !== lastPosition) {
    console.error(`check-full: another heavy run is active; queue position ${position}. Waiting…`);
    lastPosition = position;
  }
  await sleep(pollMs);
}

const result = spawnSync(command, { stdio: 'inherit', shell: true });
process.exitCode = result.status ?? 1;
