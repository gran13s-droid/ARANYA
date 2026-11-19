import { describe, expect, it } from 'vitest';
import { RUN_SPEED, TICK_DT } from './constants.ts';
import { SPIKE_LEVEL } from './data/spikeLevel.ts';
import { stepPlayer } from './movement.ts';
import type { Axis } from './net.ts';
import { floorAt, normalOf, type Vec3 } from './walkmesh.ts';

const level = SPIKE_LEVEL;

function walk(from: Vec3, mx: Axis, mz: Axis, ticks: number): Vec3 {
  let pos = from;
  for (let i = 0; i < ticks; i++) pos = stepPlayer(level, pos, { mx, mz });
  return pos;
}

describe('stepPlayer', () => {
  it('moves RUN_SPEED * TICK_DT per tick on flat ground', () => {
    const next = stepPlayer(level, { x: 0, y: 0, z: -6 }, { mx: 0, mz: 1 });
    expect(next.z - -6).toBeCloseTo(RUN_SPEED * TICK_DT);
    expect(next.y).toBe(0);
  });

  it('normalizes diagonal movement', () => {
    const next = stepPlayer(level, { x: 0, y: 0, z: -6 }, { mx: 1, mz: 1 });
    expect(Math.hypot(next.x, next.z + 6)).toBeCloseTo(RUN_SPEED * TICK_DT);
  });

  it('does not move without input', () => {
    const pos = { x: 1, y: 0, z: 1 };
    expect(stepPlayer(level, pos, { mx: 0, mz: 0 })).toBe(pos);
  });

  it('is deterministic for the same input sequence', () => {
    const inputs: [Axis, Axis][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
    const run = () => inputs.reduce((p, [mx, mz]) => walk(p, mx, mz, 7), { x: 0, y: 0, z: -6 });
    expect(run()).toEqual(run());
  });

  it('climbs the ramp onto the 3 m platform', () => {
    const top = walk({ x: -8, y: 0, z: -2 }, 0, 1, 100);
    expect(top.y).toBe(3);
    expect(top.z).toBeGreaterThan(6);
  });

  it('blocks walking into the side of a platform from the ground', () => {
    const pos = walk({ x: -16, y: 0, z: 10 }, 1, 0, 100);
    expect(pos.x).toBeLessThanOrEqual(-12);
    expect(pos.y).toBe(0);
  });

  it('blocks stepping off the side of the ramp halfway up (no falling)', () => {
    // 20 ticks from z = -2 ends at z = 3, the middle of the ramp (z 0..6).
    const mid = walk({ x: -8, y: 0, z: -2 }, 0, 1, 20);
    expect(mid.z).toBeCloseTo(3);
    expect(mid.y).toBeCloseTo(1.5);
    const pushed = walk(mid, -1, 0, 40);
    expect(pushed.x).toBeGreaterThanOrEqual(-10);
    expect(pushed.y).toBe(mid.y);
  });

  it('walks under the bridge on the ground level', () => {
    const pos = walk({ x: 2, y: 0, z: 4 }, 0, 1, 60);
    expect(pos.z).toBeGreaterThan(11);
    expect(pos.y).toBe(0);
  });

  it('crosses the bridge between platforms at 3 m', () => {
    const pos = walk({ x: -8, y: 3, z: 10 }, 1, 0, 80);
    expect(pos.x).toBeGreaterThan(8);
    expect(pos.y).toBe(3);
  });

  it('cannot walk off the side of the bridge', () => {
    const pos = walk({ x: 2, y: 3, z: 10 }, 0, 1, 40);
    expect(pos.z).toBeLessThanOrEqual(11);
    expect(pos.y).toBe(3);
  });

  it('finds the ramp as the floor halfway up and gives it a tilted normal', () => {
    const mid = walk({ x: -8, y: 0, z: -2 }, 0, 1, 20);
    const floor = floorAt(level, mid);
    expect(floor?.id).toBe('ramp_a');
    const n = normalOf(floor!);
    expect(n.y).toBeGreaterThan(0);
    expect(n.z).toBeLessThan(0); // rises to the north, so the normal leans south
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1);
    expect(floorAt(level, { x: 2, y: 0, z: 10 })?.id).toBe('ground'); // under the bridge
  });

  it('is blocked by trees', () => {
    const pos = walk({ x: 6, y: 0, z: -12 }, 0, 1, 80);
    expect(pos.z).toBeLessThan(-6);
  });
});
