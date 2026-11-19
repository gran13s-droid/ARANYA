import { beforeEach, describe, expect, it } from 'vitest';
import {
  MONSTERS,
  MotionAct,
  SPIKE_LEVEL,
  SWORDSMAN_STATS,
  createRng,
  stepMotion,
  type HitEvent,
  type ProjectileEvent,
  type TelegraphEvent,
  type Vec3,
} from '@aranya/shared';
import { CombatWorld, type Clock } from './combat.ts';

class FakeClock implements Clock {
  time = 10_000;
  private timers: { at: number; cb: () => void }[] = [];
  now(): number {
    return this.time;
  }
  setTimeout(cb: () => void, ms: number): void {
    this.timers.push({ at: this.time + ms, cb });
  }
  advance(ms: number, onTick: () => void): void {
    const end = this.time + ms;
    while (this.time < end) {
      this.time = Math.min(end, this.time + 50);
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.cb();
      onTick();
    }
  }
}

const SPAWN = { x: 0, y: 0, z: -6 };
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('monster AI (ROADMAP 1.3, GDD 8.3)', () => {
  let clock: FakeClock;
  let world: CombatWorld;
  let hits: HitEvent[];
  let telegraphs: TelegraphEvent[];
  let projectiles: ProjectileEvent[];
  let seq = 0;

  const tick = (ms: number): void => clock.advance(ms, () => world.tick(SPAWN));
  const place = (id: string, pos: Vec3): void => {
    world.players.get(id)!.motion = { ...world.players.get(id)!.motion, ...pos };
  };
  const hitBy = (target: string) => hits.filter((h) => h.target === target && h.kind === 'damage');

  beforeEach(() => {
    clock = new FakeClock();
    hits = [];
    telegraphs = [];
    projectiles = [];
    world = new CombatWorld(SPIKE_LEVEL, createRng(3), clock, {
      ack: () => {},
      castStarted: () => {},
      hits: (h) => hits.push(...h),
      telegraph: (t) => telegraphs.push(t),
      projectile: (p) => projectiles.push(p),
      projectileEnd: () => {},
    });
    world.addPlayer('p1', SPAWN);
  });

  describe('Lost Mom (ลูกมอมหลงทาง)', () => {
    beforeEach(() => {
      world.addMonster('mom', 'lostMom', { x: 0, y: 0, z: -12 });
      place('p1', { x: 0, y: 0, z: -10 });
    });

    it('never attacks first', () => {
      tick(8000);
      expect(telegraphs).toHaveLength(0);
      expect(world.players.get('p1')!.hp).toBe(SWORDSMAN_STATS.maxHp);
    });

    it('steps back when hit, telegraphs 1.0 s, then fires a slow jade orb that hits', () => {
      world.cast('p1', { seq: ++seq, skill: 'attack', fx: 0, fz: -1 });
      const mom = world.targets.get('mom')!;
      const before = dist(mom.pos, world.players.get('p1')!.motion);
      tick(600);
      expect(dist(mom.pos, world.players.get('p1')!.motion)).toBeGreaterThan(before + 1);
      tick(2000);
      expect(telegraphs[0]).toMatchObject({ source: 'mom', durationMs: 1000, shape: { kind: 'line', length: 8 } });
      tick(1100);
      expect(projectiles).toHaveLength(1);
      expect(Math.hypot(projectiles[0]!.vx, projectiles[0]!.vz)).toBeCloseTo(MONSTERS.lostMom.attack.speed!);
      tick(2000);
      expect(hitBy('p1').length).toBeGreaterThan(0);
    });

    it('dodging out of the telegraphed line avoids the orb (direction locked at wind-up)', () => {
      world.cast('p1', { seq: ++seq, skill: 'attack', fx: 0, fz: -1 });
      for (let i = 0; i < 100 && telegraphs.length === 0; i++) tick(50);
      expect(telegraphs).toHaveLength(1);
      const p = world.players.get('p1')!;
      p.motion = stepMotion(SPIKE_LEVEL, p.motion, { mx: 1, mz: 0, act: MotionAct.Dodge });
      for (let i = 0; i < 6; i++) p.motion = stepMotion(SPIKE_LEVEL, p.motion, { mx: 1, mz: 0 });
      tick(2500); // the orb flies and expires; the next shot is still on cooldown
      expect(projectiles).toHaveLength(1);
      expect(hitBy('p1')).toHaveLength(0);
    });

    it('flees below 30% HP and does not shoot while fleeing', () => {
      const mom = world.targets.get('mom')!;
      world.cast('p1', { seq: ++seq, skill: 'attack', fx: 0, fz: -1 });
      tick(100);
      mom.hp = Math.floor(mom.maxHp * 0.25);
      const shotsBefore = telegraphs.length;
      const start = dist(mom.pos, world.players.get('p1')!.motion);
      tick(3000);
      expect(dist(mom.pos, world.players.get('p1')!.motion)).toBeGreaterThan(start + 5);
      expect(telegraphs.length).toBe(shotsBefore);
      expect(mom.monster!.mode).toBe('flee');
    });

    it('is purified at 0 HP and respawns at its spawn point', () => {
      const mom = world.targets.get('mom')!;
      mom.hp = 1;
      world.cast('p1', { seq: ++seq, skill: 'attack', fx: 0, fz: -1 });
      tick(200);
      expect(hits.some((h) => h.kind === 'death' && h.target === 'mom')).toBe(true);
      tick(MONSTERS.lostMom.respawnMs);
      expect(mom.hp).toBe(mom.maxHp);
      expect(mom.pos).toMatchObject({ x: 0, z: -12 });
    });
  });

  describe('Fire Fowl (ไก่ป่าเพลิง)', () => {
    beforeEach(() => {
      world.addMonster('fowl', 'fireFowl', { x: 0, y: 0, z: -14 });
    });

    it('attacks first within aggro range: chases, telegraphs, then pecks 3 times', () => {
      place('p1', { x: 0, y: 0, z: -9 });
      tick(4000);
      expect(telegraphs.length).toBeGreaterThanOrEqual(1);
      expect(telegraphs[0]!.durationMs).toBeGreaterThanOrEqual(1000);
      expect(hitBy('p1').length).toBeGreaterThanOrEqual(3);
    });

    it('ignores players outside its aggro range', () => {
      place('p1', { x: 0, y: 0, z: 0 });
      tick(4000);
      expect(telegraphs).toHaveLength(0);
    });

    it('returns home and heals when pulled past the leash', () => {
      const fowl = world.targets.get('fowl')!;
      fowl.hp = 100;
      fowl.pos = { x: 0, y: 0, z: 3 }; // 17 m from home
      tick(8000);
      // Back home (it may already be wandering again inside its wander radius) and healed.
      expect(dist(fowl.pos, { x: 0, y: 0, z: -14 })).toBeLessThanOrEqual(MONSTERS.fireFowl.wanderRadius + 0.1);
      expect(fowl.hp).toBe(fowl.maxHp);
    });

    it('is taunted by sword stance away from another player (GDD 5.2)', () => {
      world.addPlayer('p2', SPAWN);
      place('p2', { x: 0, y: 0, z: -12 });
      place('p1', { x: 4, y: 0, z: -14 });
      tick(200);
      world.cast('p1', { seq: ++seq, skill: 'stance', fx: 0, fz: 1 });
      tick(200);
      expect(world.targets.get('fowl')!.monster!.targetId).toBe('p1');
      tick(7000); // finishes the flurry already aimed at p2, then cooldown + wind-up on p1
      expect(world.targets.get('fowl')!.monster!.targetId).toBe('p1');
      expect(hitBy('p1').length).toBeGreaterThan(0);
    });

    it('a lunge stun cancels its wind-up', () => {
      place('p1', { x: 0, y: 0, z: -11 });
      tick(1200);
      expect(world.targets.get('fowl')!.monster!.windup).not.toBeNull();
      const p = world.players.get('p1')!;
      p.motion = { ...p.motion, fx: 0, fz: -1 };
      p.motion = stepMotion(SPIKE_LEVEL, p.motion, { mx: 0, mz: -1, act: MotionAct.Lunge });
      tick(50);
      expect(world.targets.get('fowl')!.monster!.windup).toBeNull();
    });
  });

  describe('Khamod (ผีโขมด)', () => {
    beforeEach(() => {
      world.addMonster('kha', 'khamod', { x: 0, y: 0, z: -12 });
      place('p1', { x: 0, y: 0, z: -7 });
    });

    it('floats in, warns 1.2 s with a circle, explodes and is gone until respawn', () => {
      tick(6000);
      expect(telegraphs[0]).toMatchObject({ source: 'kha', durationMs: 1200, shape: { kind: 'circle' } });
      expect(hitBy('p1').length).toBe(1);
      expect(hits.some((h) => h.kind === 'death' && h.target === 'kha')).toBe(true);
      expect(world.targets.get('kha')!.hp).toBe(0);
    });
  });
});
