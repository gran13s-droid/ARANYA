import { describe, expect, it } from 'vitest';
import { InterpolationBuffer } from './interpolation.ts';

describe('InterpolationBuffer', () => {
  it('returns null when empty', () => {
    expect(new InterpolationBuffer().sample(0)).toBeNull();
  });

  it('interpolates between the two snapshots around the render time', () => {
    const b = new InterpolationBuffer();
    b.push(0, { x: 0, y: 0, z: 0 });
    b.push(50, { x: 10, y: 0, z: 2 });
    expect(b.sample(25)).toEqual({ x: 5, y: 0, z: 1 });
  });

  it('holds the newest position instead of extrapolating', () => {
    const b = new InterpolationBuffer();
    b.push(0, { x: 0, y: 0, z: 0 });
    b.push(50, { x: 4, y: 0, z: 0 });
    expect(b.sample(500)).toEqual({ x: 4, y: 0, z: 0 });
  });

  it('keeps a bounded history', () => {
    const b = new InterpolationBuffer(3);
    for (let i = 0; i < 10; i++) b.push(i * 50, { x: i, y: 0, z: 0 });
    expect(b.sample(0)).toEqual({ x: 7, y: 0, z: 0 });
  });
});
