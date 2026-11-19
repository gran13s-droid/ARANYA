import { beforeEach, describe, expect, it } from 'vitest';
import {
  MotionAct,
  SPIKE_LEVEL,
  SWORDSMAN,
  SWORDSMAN_STATS,
  createRng,
  hitDelayMs,
  stepMotion,
  type CastAck,
  type CastMessage,
  type HitEvent,
  type TelegraphEvent,
} from '@aranya/shared';
import { CombatWorld, MAX_REWIND_MS, TELEGRAPH_MS, type Clock } from './combat.ts';
import { PositionHistory } from './history.ts';

class FakeClock implements Clock {
  time = 10_000;
  private timers: { at: number; cb: () => void }[] = [];
  now(): number {
    return this.time;
  }
  setTimeout(cb: () => void, ms: number): void {
    this.timers.push({ at: this.time + ms, cb });
  }
  advance(ms: number, onTick?: () => void): void {
    const end = this.time + ms;
    while (this.time < end) {
      this.time = Math.min(end, this.time + 50);
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.cb();
      onTick?.();
    }
  }
}

const SPAWN = { x: 0, y: 0, z: -6 };

describe('CombatWorld', () => {
  let clock: FakeClock;
  let acks: CastAck[];
  let hits: HitEvent[];
  let telegraphs: TelegraphEvent[];
  let world: CombatWorld;
  let seq = 0;

  const cast = (skill: CastMessage['skill'], fx = 0, fz = 1): CastAck => {
    world.cast('p1', { seq: ++seq, skill, fx, fz });
    return acks.at(-1)!;
  };
  const tick = (ms: number): void => clock.advance(ms, () => world.tick(SPAWN));

  beforeEach(() => {
    clock = new FakeClock();
    acks = [];
    hits = [];
    telegraphs = [];
    world = new CombatWorld(SPIKE_LEVEL, createRng(7), clock, {
      ack: (_id, a) => acks.push(a),
      castStarted: () => {},
      hits: (h) => hits.push(...h),
      telegraph: (t) => telegraphs.push(t),
      projectile: () => {},
      projectileEnd: () => {},
    });
    world.addPlayer('p1', SPAWN);
    world.addTarget({ id: 'dummy', kind: 'dummy', pos: { x: 0, y: 0, z: -4.5 }, elements: ['jade'], maxHp: 2000, def: 30, atk: 0 });
  });

  it('lands the first swing at the animation impact frame, not before', () => {
    cast('attack');
    tick(hitDelayMs('attack1') - 50);
    expect(hits).toHaveLength(0);
    tick(100);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ target: 'dummy', kind: 'damage' });
    expect(world.targets.get('dummy')!.hp).toBe(2000 - hits[0]!.amount);
  });

  it('chains the 3-hit combo inside the window and restarts after it', () => {
    expect(cast('attack').comboStep).toBe(1);
    tick(SWORDSMAN.attack.combo.length && 330);
    expect(cast('attack').comboStep).toBe(2);
    tick(330);
    expect(cast('attack').comboStep).toBe(3);
    tick(500 + SWORDSMAN.attack.comboWindowMs + 100);
    expect(cast('attack').comboStep).toBe(1);
  });

  it('rejects a cast while the previous swing is still playing', () => {
    cast('attack');
    expect(cast('attack')).toMatchObject({ ok: false, reason: 'busy' });
  });

  it('applies the fire bonus against a jade target (GDD 6.3)', () => {
    cast('attack');
    tick(400);
    // fire vs jade = 1.25: 50 * 0.8 * 100/130 * 1.25 = 38.46, +-5% variance, crit possible.
    expect(hits[0]!.amount).toBeGreaterThanOrEqual(36);
  });

  it('builds ปราณดาบ from hits and spends it on the ultimate', () => {
    expect(cast('ultimate')).toMatchObject({ ok: false, reason: 'resource' });
    const p = world.players.get('p1')!;
    p.resource = SWORDSMAN_STATS.resourceMax;
    expect(cast('ultimate')).toMatchObject({ ok: true, cooldownMs: SWORDSMAN.ultimate.cooldownMs });
    expect(p.resource).toBe(0);
    tick(1000);
    expect(cast('ultimate')).toMatchObject({ ok: false });
  });

  it('enforces cooldowns server-side', () => {
    expect(cast('stance').ok).toBe(true);
    tick(1000);
    expect(cast('stance')).toMatchObject({ ok: false, reason: 'cooldown' });
    tick(SWORDSMAN.stance.cooldownMs);
    expect(cast('stance').ok).toBe(true);
  });

  it('slows the player during sword stance', () => {
    cast('stance');
    tick(50);
    expect(world.players.get('p1')!.motion.speedMul).toBe(SWORDSMAN.stance.moveMult);
    tick(SWORDSMAN.stance.durationMs);
    expect(world.players.get('p1')!.motion.speedMul).toBe(1);
  });

  it('burns the target after combo hit 3', () => {
    cast('attack'); tick(330);
    cast('attack'); tick(330);
    cast('attack'); tick(600);
    const before = hits.filter((h) => h.kind === 'burn').length;
    tick(SWORDSMAN.burn.durationMs);
    expect(hits.filter((h) => h.kind === 'burn').length - before).toBeGreaterThanOrEqual(3);
  });

  it('heals with a potion and puts it on cooldown', () => {
    const p = world.players.get('p1')!;
    p.hp = 100;
    expect(cast('potion').ok).toBe(true);
    expect(p.hp).toBe(100 + SWORDSMAN_STATS.maxHp * SWORDSMAN.potion.healPct);
    expect(cast('potion')).toMatchObject({ ok: false, reason: 'cooldown' });
  });

  it('restores mana with a mana potion, capped at the maximum, and puts it on cooldown', () => {
    const p = world.players.get('p1')!;
    p.resource = 80;
    expect(cast('manaPotion')).toMatchObject({ ok: true, cooldownMs: SWORDSMAN.manaPotion.cooldownMs });
    expect(p.resource).toBe(SWORDSMAN_STATS.resourceMax);
    expect(hits.at(-1)).toMatchObject({ kind: 'mana', amount: 20 });
    expect(cast('manaPotion')).toMatchObject({ ok: false, reason: 'cooldown' });
  });

  describe('lag compensation', () => {
    it('hits where a moving target was when the attacker saw it', () => {
      const t = world.targets.get('dummy')!;
      world.players.get('p1')!.rttMs = 100; // rewind = 100 + 50 = 150 ms
      // Target sits in range, then (in real time) moves out of range 100 ms before the impact.
      tick(500);
      cast('attack');
      tick(hitDelayMs('attack1') - 100);
      t.pos = { x: 0, y: 0, z: 5 };
      tick(150);
      expect(hits.filter((h) => h.kind === 'damage')).toHaveLength(1);
    });

    it('never rewinds more than MAX_REWIND_MS', () => {
      const h = new PositionHistory();
      for (let i = 0; i <= 20; i++) h.push(i * 50, { x: i, y: 0, z: 0 });
      expect(h.at(1000 - MAX_REWIND_MS, { x: 0, y: 0, z: 0 }).x).toBeCloseTo(16);
      expect(h.at(1025, { x: 0, y: 0, z: 0 }).x).toBe(20);
      expect(h.at(1012.5 - 25, { x: 0, y: 0, z: 0 }).x).toBeCloseTo(19.75);
    });
  });

  describe('sparring dummy', () => {
    beforeEach(() => {
      world.targets.clear();
      world.addTarget({ id: 'spar', kind: 'sparring', pos: { x: 0, y: 0, z: -4 }, elements: ['smoke'], maxHp: 2000, def: 30, atk: 40 });
    });

    // The first attack lands 4 s after the dummy appears; its telegraph starts 1 s earlier.
    const HIT_AT = 4000;

    it(`telegraphs at least ${TELEGRAPH_MS} ms before hitting (GDD 4.3)`, () => {
      tick(HIT_AT - TELEGRAPH_MS);
      expect(telegraphs).toHaveLength(1);
      expect(telegraphs[0]!.durationMs).toBeGreaterThanOrEqual(1000);
      expect(world.players.get('p1')!.hp).toBe(SWORDSMAN_STATS.maxHp);
      tick(TELEGRAPH_MS);
      expect(world.players.get('p1')!.hp).toBeLessThan(SWORDSMAN_STATS.maxHp);
    });

    it('does no damage during dodge i-frames', () => {
      const p = world.players.get('p1')!;
      tick(HIT_AT - 100);
      p.motion = stepMotion(SPIKE_LEVEL, p.motion, { mx: 0, mz: 0, act: MotionAct.Dodge });
      tick(150);
      expect(telegraphs).toHaveLength(1);
      expect(p.hp).toBe(SWORDSMAN_STATS.maxHp);
    });

    it('parries: no damage and a 150% counter', () => {
      const p = world.players.get('p1')!;
      tick(HIT_AT - 200);
      cast('parry');
      tick(250);
      expect(p.hp).toBe(SWORDSMAN_STATS.maxHp);
      expect(hits.some((h) => h.kind === 'parry')).toBe(true);
      expect(world.targets.get('spar')!.hp).toBeLessThan(2000);
    });

    it('reduces damage in sword stance (x0.7)', () => {
      const p = world.players.get('p1')!;
      cast('stance');
      tick(5000);
      const taken = SWORDSMAN_STATS.maxHp - p.hp;
      // smoke vs fire 1.25: 40 * 100/130 * 1.25 * 0.7 = 26.9 (+-5%, crit x1.5 at most)
      expect(taken).toBeGreaterThan(20);
      expect(taken).toBeLessThan(45);
    });

    it('is stunned by the lunge and cancels its attack', () => {
      const p = world.players.get('p1')!;
      p.motion = { ...p.motion, fz: 1 };
      tick(HIT_AT - 300); // telegraph is already showing
      expect(telegraphs).toHaveLength(1);
      p.motion = stepMotion(SPIKE_LEVEL, p.motion, { mx: 0, mz: 1, act: MotionAct.Lunge });
      world.tick(SPAWN);
      tick(50);
      expect(hits.some((h) => h.kind === 'stun' && h.target === 'spar')).toBe(true);
      tick(TELEGRAPH_MS + 200);
      expect(p.hp).toBe(SWORDSMAN_STATS.maxHp);
    });

    it('kills and respawns the player', () => {
      const p = world.players.get('p1')!;
      p.hp = 1;
      tick(HIT_AT + 50);
      expect(p.dead).toBe(true);
      expect(cast('attack')).toMatchObject({ ok: false, reason: 'dead' });
      tick(SWORDSMAN_STATS.respawnMs);
      expect(p.dead).toBe(false);
      expect(p.hp).toBe(p.maxHp);
      expect(p.motion).toMatchObject(SPAWN);
    });
  });
});
