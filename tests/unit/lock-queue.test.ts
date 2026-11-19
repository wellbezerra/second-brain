import { describe, expect, it } from 'vitest';
import { queueState, ticketName } from '../../scripts/lock-queue.ts';

const alive = () => true;

describe('check-full queue', () => {
  it('gives the lock to the oldest run', () => {
    const first = ticketName(1_000, 10);
    const second = ticketName(2_000, 20);
    expect(queueState([second, first], first, alive).position).toBe(0);
    expect(queueState([second, first], second, alive).position).toBe(1);
  });

  it('reports how many runs are ahead in the queue', () => {
    const tickets = [ticketName(1, 1), ticketName(2, 2), ticketName(3, 3)];
    expect(queueState(tickets, ticketName(3, 3), alive).position).toBe(2);
  });

  it('discards a lock whose process is dead and moves up', () => {
    const dead = ticketName(1_000, 99);
    const mine = ticketName(2_000, 20);
    const state = queueState([dead, mine], mine, (pid) => pid !== 99);
    expect(state).toEqual({ position: 0, stale: [dead] });
  });

  it('ignores files that are not tickets', () => {
    const mine = ticketName(5, 5);
    expect(queueState(['notes.txt', mine], mine, alive)).toEqual({ position: 0, stale: [] });
  });
});
