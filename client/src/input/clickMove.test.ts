import { describe, expect, it } from 'vitest';
import { MOVE_AXIS_MAX, SPIKE_LEVEL, floorAt, parseInput, stepPlayer, type Vec3 } from '@aranya/shared';
import { ARRIVE_DIST, ClickMove, MELEE_REACH, STUCK_TICKS, groundHit, steer } from './clickMove.ts';

const level = SPIKE_LEVEL;
const start0 = level.spawn;

/** Runs the order through the real shared movement, like prediction does. */
function walk(cm: ClickMove, from: Vec3, ticks: number, targetPos: (id: string) => Vec3 | null = () => null): Vec3 {
  let pos = from;
  for (let i = 0; i < ticks && cm.order; i++) pos = stepPlayer(level, pos, cm.tick(pos, targetPos));
  return pos;
}

describe('groundHit', () => {
  it('finds the ground under a downward ray', () => {
    const p = groundHit(level, { x: 2, y: 20, z: 3 }, { x: 0, y: -1, z: 0 })!;
    expect(p.x).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(level.spawn.y, 3);
  });

  it('returns the first floor along a slanted camera ray', () => {
    const o = { x: start0.x, y: start0.y + 20, z: start0.z - 28 };
    const dir = { x: 0, y: -0.57, z: 0.82 };
    const p = groundHit(level, o, dir)!;
    // On the ray, and standing on a floor the movement code knows (within step height).
    const t = (p.y - o.y) / dir.y;
    expect(p.z).toBeCloseTo(o.z + dir.z * t, 6);
    expect(floorAt(level, p)).not.toBeNull();
  });

  it('misses when pointing at the sky', () => {
    expect(groundHit(level, { x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});

describe('steer', () => {
  it('sends a quantized direction the server accepts', () => {
    const d = steer({ x: 0, y: 0, z: 0 }, { x: 3, z: 1 }, 0.1)!;
    expect(Number.isInteger(d.mx) && Number.isInteger(d.mz)).toBe(true);
    expect(Math.max(Math.abs(d.mx), Math.abs(d.mz))).toBeLessThanOrEqual(MOVE_AXIS_MAX);
    expect(parseInput({ seq: 1, ...d })).not.toBeNull();
    expect(Math.atan2(d.mz, d.mx)).toBeCloseTo(Math.atan2(1, 3), 1);
  });

  it('stops inside the stop distance', () => {
    expect(steer({ x: 0, y: 0, z: 0 }, { x: 0.05, z: 0 }, 0.1)).toBeNull();
  });
});

describe('ClickMove', () => {
  const start = level.spawn;

  it('walks to a clicked point and ends the order there', () => {
    const cm = new ClickMove();
    const goal = { x: start.x + 4, y: start.y, z: start.z + 1.5 };
    cm.moveTo(goal);
    const end = walk(cm, start, 60);
    expect(cm.order).toBeNull();
    expect(Math.hypot(end.x - goal.x, end.z - goal.z)).toBeLessThanOrEqual(ARRIVE_DIST + 1e-9);
  });

  it('walks up to a target, stops in melee reach and keeps the order', () => {
    const cm = new ClickMove();
    const monster = { x: start.x + 6, y: start.y, z: start.z };
    cm.chase('m1');
    const end = walk(cm, start, 40, () => monster);
    expect(cm.chasing).toBe('m1');
    expect(cm.inReach(end, monster)).toBe(true);
    expect(Math.hypot(end.x - monster.x, end.z - monster.z)).toBeGreaterThan(MELEE_REACH - 0.3);
  });

  it('drops the order when the target dies or disappears', () => {
    const cm = new ClickMove();
    cm.chase('m1');
    expect(cm.tick(start, () => null)).toEqual({ mx: 0, mz: 0 });
    expect(cm.order).toBeNull();
  });

  it('gives up after a few ticks without progress (blocked)', () => {
    const cm = new ClickMove();
    cm.moveTo({ x: start.x + 10, y: start.y, z: start.z });
    for (let i = 0; i <= STUCK_TICKS; i++) cm.tick(start, () => null);
    expect(cm.order).toBeNull();
  });
});
