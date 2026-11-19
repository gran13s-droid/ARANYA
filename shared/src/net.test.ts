import { describe, expect, it } from 'vitest';
import { parseInput } from './net.ts';

describe('parseInput', () => {
  it('accepts a valid input', () => {
    expect(parseInput({ seq: 3, mx: -1, mz: 1 })).toEqual({ seq: 3, mx: -1, mz: 1 });
  });

  it.each([
    null,
    'input',
    { seq: -1, mx: 0, mz: 0 },
    { seq: 1.5, mx: 0, mz: 0 },
    { seq: 1, mx: 2, mz: 0 },
    { seq: 1, mx: 0.5, mz: 0 },
    { seq: 1, mx: 0 },
    { seq: Number.NaN, mx: 0, mz: 0 },
    { seq: 2 ** 32, mx: 0, mz: 0 },
  ])('rejects %j', (payload) => {
    expect(parseInput(payload)).toBeNull();
  });
});
