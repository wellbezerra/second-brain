// Pure queue logic for the check-full lock. A ticket is a file named
// `<15-digit epoch ms>-<pid>.ticket`; the oldest live ticket holds the lock.

export const TICKET_SUFFIX = '.ticket';

export function ticketName(nowMs: number, pid: number): string {
  return `${String(nowMs).padStart(15, '0')}-${pid}${TICKET_SUFFIX}`;
}

export function ticketPid(name: string): number | null {
  const match = /^\d{15}-(\d+)\.ticket$/.exec(name);
  return match ? Number(match[1]) : null;
}

export type QueueState = {
  /** 0 means this run holds the lock; n means n runs are ahead of it. */
  position: number;
  /** Tickets whose owning process is dead; safe to delete. */
  stale: string[];
};

export function queueState(
  files: readonly string[],
  mine: string,
  isAlive: (pid: number) => boolean,
): QueueState {
  const stale: string[] = [];
  const live: string[] = [];
  for (const name of [...files].sort()) {
    const pid = ticketPid(name);
    if (pid === null) continue;
    if (name === mine || isAlive(pid)) live.push(name);
    else stale.push(name);
  }
  return { position: Math.max(0, live.indexOf(mine)), stale };
}
