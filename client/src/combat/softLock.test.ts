import { describe, expect, it } from 'vitest';
import type { TargetInfo } from '../world/targets.ts';
import { LOCK_RANGE, aimAt, nextTarget } from './softLock.ts';

const t = (id: string, x: number, z: number, hp = 100): TargetInfo => ({ id, kind: 'monster', species: 'lostMom', element: 'jade', pos: { x, y: 0, z }, hp, maxHp: 100 });
const me = { x: 0, y: 0, z: 0 };

describe('soft lock (GDD 4.3)', () => {
  const list = [t('far', 10, 0), t('near', 2, 0), t('mid', 0, 5), t('dead', 1, 0, 0), t('out', LOCK_RANGE + 1, 0)];

  it('locks the nearest living target in range first', () => {
    expect(nextTarget(list, me, null)).toBe('near');
  });

  it('cycles by distance and wraps around, skipping dead and out-of-range targets', () => {
    expect(nextTarget(list, me, 'near')).toBe('mid');
    expect(nextTarget(list, me, 'mid')).toBe('far');
    expect(nextTarget(list, me, 'far')).toBe('near');
  });

  it('returns null when nothing is in range', () => {
    expect(nextTarget([t('out', 40, 0)], me, null)).toBeNull();
  });

  it('aims at the locked target, but not when it is dead or too far', () => {
    expect(aimAt(t('a', 3, 4), me)).toEqual({ fx: 0.6, fz: 0.8 });
    expect(aimAt(t('a', 3, 4, 0), me)).toBeNull();
    expect(aimAt(t('a', 30, 0), me)).toBeNull();
    expect(aimAt(null, me)).toBeNull();
  });
});
