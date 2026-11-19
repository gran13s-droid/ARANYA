import { describe, expect, it } from 'vitest';
import { computeDamage } from './combat/damage.ts';
import { createRng } from './combat/rng.ts';
import { inShape, normalizeFacing } from './combat/shapes.ts';
import { PLAYER_ANIMS, impactMs } from './data/animations.ts';
import { ELEMENT_MULT, ELEMENTS, elementMultiplier } from './data/elements.ts';
import { SPIKE_LEVEL } from './data/spikeLevel.ts';
import { HOTBAR, SWORDSMAN, hitDelayMs } from './data/skills.ts';
import { DODGE_CD_TICKS, MotionAct, initialMotion, isDodging, stepMotion, type Motion } from './motion.ts';
import { parseCast, parseInput } from './net.ts';

const fixed = (...values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('elements (GDD 6.3)', () => {
  it('follows the cycle smoke > fire > jade > dark > smoke at 1.25', () => {
    expect(ELEMENT_MULT.smoke.fire).toBe(1.25);
    expect(ELEMENT_MULT.fire.jade).toBe(1.25);
    expect(ELEMENT_MULT.jade.dark).toBe(1.25);
    expect(ELEMENT_MULT.dark.smoke).toBe(1.25);
  });

  it('never exceeds 1.25 and resists its own element at 0.9', () => {
    for (const a of ELEMENTS) {
      expect(ELEMENT_MULT[a][a]).toBe(0.9);
      for (const t of ELEMENTS) expect(ELEMENT_MULT[a][t]).toBeLessThanOrEqual(1.25);
    }
  });

  it('averages two target elements (corrupted enemies are also dark)', () => {
    expect(elementMultiplier('jade', ['fire', 'dark'])).toBeCloseTo((0.8 + 1.25) / 2);
  });
});

describe('computeDamage (GDD 6.5)', () => {
  it('matches the formula with a fixed roll', () => {
    // rng: 0.99 -> no crit, 0.5 -> variance 1.0
    const r = computeDamage({ atk: 50, skillCoef: 1, def: 100, attackElement: 'fire', targetElements: ['jade'] }, fixed(0.99, 0.5));
    expect(r).toEqual({ amount: Math.round(50 * 0.5 * 1.25), crit: false, elemMult: 1.25 });
  });

  it('applies crit, defense and bonus multipliers and never goes below 1', () => {
    const crit = computeDamage({ atk: 100, skillCoef: 1, def: 0, attackElement: 'jade', targetElements: ['jade'], defenseMult: 0.2, bonusMult: 1.2 }, fixed(0, 0.5));
    expect(crit.crit).toBe(true);
    expect(crit.amount).toBe(Math.round(100 * 0.9 * 1.5 * 0.2 * 1.2));
    expect(computeDamage({ atk: 1, skillCoef: 0.01, def: 1000, attackElement: 'fire', targetElements: ['smoke'] }, fixed(0.99, 0)).amount).toBe(1);
  });

  it('is reproducible from the same seed', () => {
    const roll = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 20 }, () => computeDamage({ atk: 50, skillCoef: 1.4, def: 30, attackElement: 'fire', targetElements: ['dark'] }, rng).amount);
    };
    expect(roll(42)).toEqual(roll(42));
  });
});

describe('hit shapes', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const arc = { kind: 'arc' as const, radius: 2.2, angleDeg: 120 };

  it('hits inside the arc and misses behind', () => {
    expect(inShape(arc, origin, 0, 1, { x: 0, y: 0, z: 2 })).toBe(true);
    expect(inShape(arc, origin, 0, 1, { x: 0, y: 0, z: -1.5 })).toBe(false);
    expect(inShape(arc, origin, 0, 1, { x: 0, y: 0, z: 3.5 })).toBe(false);
  });

  it('never hits across floors (height tolerance)', () => {
    expect(inShape(arc, origin, 0, 1, { x: 0, y: 3, z: 1 })).toBe(false);
  });

  it('tests circles and lines', () => {
    expect(inShape({ kind: 'circle', radius: 3 }, origin, 0, 1, { x: 3, y: 0, z: 0 })).toBe(true);
    const line = { kind: 'line' as const, length: 8, width: 1 };
    expect(inShape(line, origin, 1, 0, { x: 7, y: 0, z: 0.5 })).toBe(true);
    expect(inShape(line, origin, 1, 0, { x: 7, y: 0, z: 2 })).toBe(false);
  });

  it('normalizes bad facings safely', () => {
    expect(normalizeFacing(0, 0)).toEqual({ fx: 0, fz: -1 });
    expect(normalizeFacing(3, 4)).toEqual({ fx: 0.6, fz: 0.8 });
  });
});

describe('skills data', () => {
  it('has the 7-slot hotbar of GDD 4.3', () => {
    expect(HOTBAR).toEqual(['attack', 'stance', 'lunge', 'parry', 'ultimate', 'dodge', 'potion']);
  });

  it('times combo hits from the animation impact frames (Art Bible 5.2)', () => {
    expect(hitDelayMs('attack1')).toBe(impactMs(PLAYER_ANIMS.attack1));
    expect(hitDelayMs('attack3')).toBe(impactMs(PLAYER_ANIMS.attack3));
    expect(SWORDSMAN.attack.combo.map((c) => c.anim)).toEqual(['attack1', 'attack2', 'attack3']);
  });
});

describe('stepMotion', () => {
  const level = SPIKE_LEVEL;
  const run = (m: Motion, ticks: number, input: Parameters<typeof stepMotion>[2]): Motion => {
    let s = m;
    for (let i = 0; i < ticks; i++) s = stepMotion(level, s, i === 0 ? input : { mx: input.mx, mz: input.mz });
    return s;
  };

  it('dodges 4 m with i-frames, then goes on cooldown (GDD 4.3)', () => {
    const start = initialMotion({ x: 0, y: 0, z: -6 });
    const first = stepMotion(level, start, { mx: 1, mz: 0, act: MotionAct.Dodge });
    expect(isDodging(first)).toBe(true);
    const end = run(first, 10, { mx: 0, mz: 0 });
    expect(end.x - start.x).toBeCloseTo(SWORDSMAN.dodge.distance);
    expect(isDodging(end)).toBe(false);
    const again = stepMotion(level, end, { mx: 1, mz: 0, act: MotionAct.Dodge });
    expect(isDodging(again)).toBe(false);
    expect(again.dodgeCdTicks).toBe(DODGE_CD_TICKS - 11);
  });

  it('lunges 8 m forward in the facing direction', () => {
    const start = { ...initialMotion({ x: 0, y: 0, z: -12 }), fx: 0, fz: 1 };
    const end = run(start, 10, { mx: 0, mz: 0, act: MotionAct.Lunge });
    expect(end.z - start.z).toBeCloseTo(SWORDSMAN.lunge.distance);
  });

  it('cannot dodge off the bridge (dashes use normal collision)', () => {
    const onBridge = { ...initialMotion({ x: 2, y: 3, z: 10 }), fx: 0, fz: 1 };
    const end = run(onBridge, 10, { mx: 0, mz: 1, act: MotionAct.Dodge });
    expect(end.y).toBe(3);
    expect(end.z).toBeLessThanOrEqual(11);
  });

  it('walks slower with a speed multiplier (sword stance)', () => {
    const normal = run(initialMotion({ x: 0, y: 0, z: -12 }), 10, { mx: 0, mz: 1 });
    const slowed = run({ ...initialMotion({ x: 0, y: 0, z: -12 }), speedMul: 0.8 }, 10, { mx: 0, mz: 1 });
    expect((slowed.z + 12) / (normal.z + 12)).toBeCloseTo(0.8);
  });
});

describe('message parsing', () => {
  it('accepts dodge/lunge acts and rejects unknown ones', () => {
    expect(parseInput({ seq: 1, mx: 0, mz: 0, act: 1 })).toEqual({ seq: 1, mx: 0, mz: 0, act: 1 });
    expect(parseInput({ seq: 1, mx: 0, mz: 0, act: 3 })).toBeNull();
  });

  it('accepts only known cast skills and normalizes the aim', () => {
    expect(parseCast({ seq: 2, skill: 'attack', fx: 0, fz: 2 })).toEqual({ seq: 2, skill: 'attack', fx: 0, fz: 1 });
    expect(parseCast({ seq: 2, skill: 'dodge', fx: 0, fz: 1 })).toBeNull();
    expect(parseCast({ seq: 2, skill: 'attack', fx: Number.NaN, fz: 1 })).toBeNull();
  });
});
