import { describe, expect, it } from 'vitest';
import { MAX_INPUT_CREDITS, MAX_QUEUED_INPUTS, type InputMessage } from '@aranya/shared';
import { InputQueue } from './inputQueue.ts';

const input = (seq: number): InputMessage => ({ seq, mx: 1, mz: 0 });

describe('InputQueue', () => {
  it('applies one input per tick in steady state', () => {
    const q = new InputQueue();
    q.push(input(0));
    expect(q.drain()).toHaveLength(1);
    q.push(input(1));
    expect(q.drain()).toHaveLength(1);
  });

  it('rejects stale and duplicated sequence numbers', () => {
    const q = new InputQueue();
    expect(q.push(input(5))).toBe(true);
    expect(q.push(input(5))).toBe(false);
    expect(q.push(input(4))).toBe(false);
  });

  it('caps the queue length', () => {
    const q = new InputQueue();
    for (let i = 0; i < MAX_QUEUED_INPUTS; i++) expect(q.push(input(i))).toBe(true);
    expect(q.push(input(MAX_QUEUED_INPUTS))).toBe(false);
  });

  it('never applies more inputs than ticks elapsed plus the burst allowance (no speed hack)', () => {
    const q = new InputQueue();
    let applied = 0;
    const ticks = 100;
    let seq = 0;
    for (let tick = 0; tick < ticks; tick++) {
      // A cheating client floods 5 inputs per tick.
      for (let k = 0; k < 5; k++) q.push(input(seq++));
      applied += q.drain().length;
    }
    expect(applied).toBeLessThanOrEqual(ticks);
  });

  it('catches up after a short network stall', () => {
    const q = new InputQueue();
    q.drain();
    q.drain();
    q.drain(); // idle ticks build up credits
    for (let i = 0; i < 3; i++) q.push(input(i));
    expect(q.drain()).toHaveLength(MAX_INPUT_CREDITS);
  });
});
