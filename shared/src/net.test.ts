import { describe, expect, it } from 'vitest';
import { MOVE_AXIS_MAX, parseInput } from './net.ts';
import { stepPlayer } from './movement.ts';
import { RUN_SPEED, TICK_DT } from './constants.ts';
import { SPIKE_LEVEL } from './data/spikeLevel.ts';

describe('parseInput', () => {
  it('accepts a valid input', () => {
    expect(parseInput({ seq: 3, mx: -1, mz: 1 })).toEqual({ seq: 3, mx: -1, mz: 1 });
  });

  it('accepts a quantized click-to-move direction', () => {
    expect(parseInput({ seq: 4, mx: 37, mz: -MOVE_AXIS_MAX })).toEqual({ seq: 4, mx: 37, mz: -MOVE_AXIS_MAX });
  });

  it('never moves faster with a larger axis value (direction only)', () => {
    const from = SPIKE_LEVEL.spawn;
    const small = stepPlayer(SPIKE_LEVEL, from, { mx: 1, mz: 0 });
    const large = stepPlayer(SPIKE_LEVEL, from, { mx: MOVE_AXIS_MAX, mz: 0 });
    expect(large).toEqual(small);
    expect(Math.hypot(large.x - from.x, large.z - from.z)).toBeCloseTo(RUN_SPEED * TICK_DT, 6);
  });

  it.each([
    null,
    'input',
    { seq: -1, mx: 0, mz: 0 },
    { seq: 1.5, mx: 0, mz: 0 },
    { seq: 1, mx: MOVE_AXIS_MAX + 1, mz: 0 },
    { seq: 1, mx: 0, mz: -MOVE_AXIS_MAX - 1 },
    { seq: 1, mx: 0.5, mz: 0 },
    { seq: 1, mx: 0 },
    { seq: Number.NaN, mx: 0, mz: 0 },
    { seq: 2 ** 32, mx: 0, mz: 0 },
  ])('rejects %j', (payload) => {
    expect(parseInput(payload)).toBeNull();
  });
});
