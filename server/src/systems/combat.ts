import {
  INTERPOLATION_DELAY_MS,
  MotionAct,
  SWORDSMAN,
  TICK_DT,
  SWORDSMAN_STATS,
  actionLockMs,
  computeDamage,
  cooldownOf,
  hitDelayMs,
  inShape,
  initialMotion,
  isDodging,
  type CastAck,
  type MonsterId,
  type ProjectileEndEvent,
  type ProjectileEvent,
  type CastMessage,
  type CastStarted,
  type Element,
  type HitEvent,
  type HitShape,
  type Level,
  type Motion,
  type PlayerAnim,
  type TelegraphEvent,
  type Vec3,
} from '@aranya/shared';
import { PositionHistory } from './history.ts';
import { createMonsterState, onMonsterHurt, tickMonster, type MonsterHost, type MonsterState } from './monsters.ts';

/**
 * Server-authoritative combat for one zone channel (ROADMAP 1.2).
 * Clients only send intents (CastMessage, dodge/lunge inside input); this class
 * decides cooldowns, resources, hit tests (with lag compensation) and damage
 * (GDD 6.5, seeded RNG). It has no Colyseus dependency so it can be unit-tested
 * with a fake clock.
 */

/** Never rewind further than this, however high the client's ping. */
export const MAX_REWIND_MS = 200;
/** Accept a cast this early before busy/cooldown ends (network jitter). */
const EARLY_GRACE_MS = 50;
/** Enemy attacks show their ground warning at least this long before landing (GDD 4.3). */
export const TELEGRAPH_MS = 1000;

export interface Clock {
  now(): number;
  setTimeout(cb: () => void, ms: number): void;
}

export interface CombatEvents {
  ack(playerId: string, ack: CastAck): void;
  castStarted(evt: CastStarted): void;
  hits(evts: HitEvent[]): void;
  telegraph(evt: TelegraphEvent): void;
  projectile(evt: ProjectileEvent): void;
  projectileEnd(evt: ProjectileEndEvent): void;
}

export interface CombatPlayer {
  id: string;
  /** Authoritative movement state; the room steps it, combat may adjust it. */
  motion: Motion;
  hp: number;
  maxHp: number;
  resource: number;
  dead: boolean;
  respawnAt: number;
  /** Smoothed round-trip time measured by the server's ping. */
  rttMs: number;
  busyUntil: number;
  combo: { step: number; endsAt: number };
  readyAt: Partial<Record<string, number>>;
  stanceUntil: number;
  parryUntil: number;
  history: PositionHistory;
  lungeHits: Set<string>;
}

export interface TargetSpec {
  id: string;
  kind: 'dummy' | 'sparring' | 'monster';
  /** For kind 'monster'. */
  species?: MonsterId;
  pos: Vec3;
  elements: Element[];
  maxHp: number;
  def: number;
  atk: number;
  /** Corrupted by ราคี (GDD 6.3: dark is a secondary element; ultimate +20%). */
  cursed?: boolean;
  facing?: { fx: number; fz: number };
}

export interface CombatTarget extends TargetSpec {
  hp: number;
  fx: number;
  fz: number;
  lastHitAt: number;
  resetAt: number;
  stunnedUntil: number;
  burn: { until: number; nextTickAt: number; source: string } | null;
  history: PositionHistory;
  /** Sparring dummy attack cycle. */
  nextAttackAt: number;
  pendingAttack: { at: number; fx: number; fz: number } | null;
  /** AI state for kind 'monster' (Step 1.3). */
  monster?: MonsterState;
}

interface Projectile {
  id: number;
  owner: string;
  pos: Vec3;
  fx: number;
  fz: number;
  speed: number;
  remaining: number;
  coef: number;
}

/** Projectile collision radius against a player (swept segment test, GDD 8.3). */
const PROJECTILE_RADIUS = 0.3;
const PLAYER_HIT_RADIUS = 0.4;

/** Sparring dummy attack (provisional): 90 degree, 3 m cone every 4 s. */
const SPARRING_ATTACK: { shape: HitShape; periodMs: number; coef: number; aggroRange: number } = {
  shape: { kind: 'arc', radius: 3, angleDeg: 90 },
  periodMs: 4000,
  coef: 1.0,
  aggroRange: 6,
};
const DUMMY_RESET_AFTER_IDLE_MS = 5000;
const DUMMY_BROKEN_MS = 2000;

export class CombatWorld implements MonsterHost {
  readonly players = new Map<string, CombatPlayer>();
  readonly targets = new Map<string, CombatTarget>();
  private readonly projectiles: Projectile[] = [];
  private nextProjectileId = 1;

  constructor(
    readonly level: Level,
    readonly rng: () => number,
    private readonly clock: Clock,
    private readonly events: CombatEvents,
  ) {}

  addPlayer(id: string, spawn: Vec3): CombatPlayer {
    const p: CombatPlayer = {
      id,
      motion: initialMotion(spawn),
      hp: SWORDSMAN_STATS.maxHp,
      maxHp: SWORDSMAN_STATS.maxHp,
      resource: 0,
      dead: false,
      respawnAt: 0,
      rttMs: 0,
      busyUntil: 0,
      combo: { step: 0, endsAt: 0 },
      readyAt: {},
      stanceUntil: 0,
      parryUntil: 0,
      history: new PositionHistory(),
      lungeHits: new Set(),
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  addTarget(spec: TargetSpec): CombatTarget {
    const t: CombatTarget = {
      ...spec,
      hp: spec.maxHp,
      fx: spec.facing?.fx ?? 0,
      fz: spec.facing?.fz ?? -1,
      lastHitAt: 0,
      resetAt: 0,
      stunnedUntil: 0,
      burn: null,
      history: new PositionHistory(),
      nextAttackAt: this.clock.now() + SPARRING_ATTACK.periodMs,
      pendingAttack: null,
    };
    if (spec.kind === 'monster' && spec.species) t.monster = createMonsterState(spec.species, spec.pos, this.clock.now());
    this.targets.set(t.id, t);
    return t;
  }

  /** Spawns a monster from MONSTERS (GDD 8.3) at a fixed spawn point; it respawns there. */
  addMonster(id: string, species: MonsterId, pos: Vec3): CombatTarget {
    const spec = createMonsterState(species, pos, 0).spec;
    return this.addTarget({ id, kind: 'monster', species, pos: { ...pos }, elements: [...spec.elements], maxHp: spec.maxHp, def: spec.def, atk: spec.atk });
  }

  // ---------------------------------------------------------------- casts

  cast(playerId: string, msg: CastMessage): void {
    const p = this.players.get(playerId);
    if (!p) return;
    const now = this.clock.now();
    const reject = (reason: string): void => this.events.ack(playerId, { seq: msg.seq, skill: msg.skill, ok: false, reason });

    if (p.dead) return reject('dead');
    if (now < p.busyUntil - EARLY_GRACE_MS) return reject('busy');
    if (now < (p.readyAt[msg.skill] ?? 0) - EARLY_GRACE_MS) return reject('cooldown');

    const { fx, fz } = msg;
    const startCooldown = (): number => {
      const cd = cooldownOf(msg.skill);
      if (cd > 0) p.readyAt[msg.skill] = now + cd;
      return cd;
    };
    const announce = (anim: PlayerAnim): void => this.events.castStarted({ id: playerId, skill: msg.skill, anim, fx, fz });

    switch (msg.skill) {
      case 'attack': {
        const combo = SWORDSMAN.attack.combo;
        const continues = p.combo.step > 0 && p.combo.step < combo.length && now <= p.combo.endsAt + SWORDSMAN.attack.comboWindowMs;
        const step = continues ? p.combo.step + 1 : 1;
        const hit = combo[step - 1]!;
        const lock = actionLockMs(hit.anim);
        p.busyUntil = now + lock;
        p.combo = { step, endsAt: now + lock };
        this.events.ack(playerId, { seq: msg.seq, skill: 'attack', ok: true, comboStep: step, cooldownMs: 0 });
        announce(hit.anim);
        this.clock.setTimeout(() => {
          const hits = this.strike(p, hit.shape, hit.coef, SWORDSMAN.attack.element, fx, fz, { burn: hit.appliesBurn === true });
          p.resource = Math.min(SWORDSMAN_STATS.resourceMax, p.resource + hits * SWORDSMAN_STATS.resourcePerHit);
        }, hitDelayMs(hit.anim));
        return;
      }
      case 'stance': {
        const cd = startCooldown();
        p.stanceUntil = now + SWORDSMAN.stance.durationMs;
        for (const t of this.targets.values()) {
          if (!t.monster || t.hp <= 0) continue;
          if (Math.hypot(t.pos.x - p.motion.x, t.pos.z - p.motion.z) > SWORDSMAN.stance.tauntRadius) continue;
          t.monster.taunt = { id: p.id, until: p.stanceUntil };
          t.monster.targetId = p.id;
        }
        p.busyUntil = now + actionLockMs(SWORDSMAN.stance.anim);
        this.events.ack(playerId, { seq: msg.seq, skill: 'stance', ok: true, cooldownMs: cd });
        announce(SWORDSMAN.stance.anim);
        return;
      }
      case 'parry': {
        const cd = startCooldown();
        const grace = Math.min(SWORDSMAN.parry.latencyGraceMaxMs, p.rttMs / 2);
        p.parryUntil = now + SWORDSMAN.parry.windowMs + grace;
        p.busyUntil = now + SWORDSMAN.parry.windowMs;
        this.events.ack(playerId, { seq: msg.seq, skill: 'parry', ok: true, cooldownMs: cd });
        announce(SWORDSMAN.parry.anim);
        return;
      }
      case 'ultimate': {
        const ult = SWORDSMAN.ultimate;
        if (p.resource < ult.resourceCost) return reject('resource');
        p.resource -= ult.resourceCost;
        const cd = startCooldown();
        p.busyUntil = now + actionLockMs(ult.anim);
        this.events.ack(playerId, { seq: msg.seq, skill: 'ultimate', ok: true, cooldownMs: cd });
        announce(ult.anim);
        this.clock.setTimeout(() => {
          this.strike(p, ult.shape, ult.coef, ult.element, fx, fz, { cursedBonus: ult.corruptedBonus });
        }, hitDelayMs(ult.anim));
        return;
      }
      case 'potion': {
        const cd = startCooldown();
        const heal = Math.round(p.maxHp * SWORDSMAN.potion.healPct);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.events.ack(playerId, { seq: msg.seq, skill: 'potion', ok: true, cooldownMs: cd });
        this.events.hits([{ source: playerId, target: playerId, kind: 'heal', amount: heal, crit: false, ...pos(p.motion) }]);
        return;
      }
      case 'manaPotion': {
        const cd = startCooldown();
        const before = p.resource;
        p.resource = Math.min(SWORDSMAN_STATS.resourceMax, p.resource + SWORDSMAN.manaPotion.restore);
        this.events.ack(playerId, { seq: msg.seq, skill: 'manaPotion', ok: true, cooldownMs: cd });
        this.events.hits([{ source: playerId, target: playerId, kind: 'mana', amount: p.resource - before, crit: false, ...pos(p.motion) }]);
        return;
      }
    }
  }

  /**
   * Resolves one hit area from a player at impact time. The caster's own
   * position is current (it is predicted), targets are rewound to what the
   * caster saw: INTERPOLATION_DELAY plus half the ping, capped at MAX_REWIND_MS.
   * Returns the number of targets hit.
   */
  private strike(p: CombatPlayer, shape: HitShape, coef: number, element: Element, fx: number, fz: number, opts: { burn?: boolean; cursedBonus?: number }): number {
    if (p.dead) return 0;
    const now = this.clock.now();
    const rewindAt = now - Math.min(MAX_REWIND_MS, INTERPOLATION_DELAY_MS + p.rttMs / 2);
    const origin = pos(p.motion);
    const hits: HitEvent[] = [];
    for (const t of this.targets.values()) {
      if (t.hp <= 0) continue;
      const seen = t.history.at(rewindAt, t.pos);
      if (!inShape(shape, origin, fx, fz, seen)) continue;
      const dmg = computeDamage(
        {
          atk: SWORDSMAN_STATS.atk,
          skillCoef: coef,
          def: t.def,
          attackElement: element,
          targetElements: t.elements,
          bonusMult: t.cursed && opts.cursedBonus ? 1 + opts.cursedBonus : 1,
        },
        this.rng,
      );
      hits.push({ source: p.id, target: t.id, kind: 'damage', amount: dmg.amount, crit: dmg.crit, ...t.pos });
      this.damageTarget(t, dmg.amount, now, p.id);
      if (opts.burn) t.burn = { until: now + SWORDSMAN.burn.durationMs, nextTickAt: now + SWORDSMAN.burn.tickMs, source: p.id };
    }
    if (hits.length > 0) this.events.hits(hits);
    return hits.length;
  }

  private damageTarget(t: CombatTarget, amount: number, now: number, source?: string): void {
    if (t.hp <= 0) return;
    t.hp = Math.max(0, t.hp - amount);
    t.lastHitAt = now;
    if (t.monster) {
      if (t.hp === 0) this.killMonster(t, now, source ?? null);
      else if (source) onMonsterHurt(t as CombatTarget & { monster: MonsterState }, source, now);
      return;
    }
    if (t.hp === 0) {
      t.resetAt = now + DUMMY_BROKEN_MS;
      t.burn = null;
      t.pendingAttack = null;
    }
  }

  // ---------------------------------------------------------------- tick

  /** Call once per simulation tick, after player motion has been stepped. */
  tick(spawn: Vec3): void {
    const now = this.clock.now();
    for (const p of this.players.values()) {
      p.history.push(now, p.motion);
      p.motion.speedMul = now < p.stanceUntil ? SWORDSMAN.stance.moveMult : 1;
      if (p.dead && now >= p.respawnAt) {
        p.dead = false;
        p.hp = p.maxHp;
        p.resource = 0;
        p.motion = initialMotion(spawn);
      }
      this.lungeContacts(p, now);
    }
    for (const t of this.targets.values()) {
      t.history.push(now, t.pos);
      this.tickTarget(t, now);
    }
    this.tickProjectiles();
  }

  /** ทะยานพยัคฆ์: targets touched during the lunge are stunned once (GDD 5.2). */
  private lungeContacts(p: CombatPlayer, now: number): void {
    if (p.motion.dashKind !== MotionAct.Lunge) {
      p.lungeHits.clear();
      return;
    }
    const stuns: HitEvent[] = [];
    for (const t of this.targets.values()) {
      if (t.hp <= 0 || p.lungeHits.has(t.id)) continue;
      if (Math.hypot(t.pos.x - p.motion.x, t.pos.z - p.motion.z) > SWORDSMAN.lunge.hitRadius + 0.5) continue;
      if (Math.abs(t.pos.y - p.motion.y) > 1.5) continue;
      p.lungeHits.add(t.id);
      t.stunnedUntil = now + SWORDSMAN.lunge.stunMs;
      t.pendingAttack = null;
      stuns.push({ source: p.id, target: t.id, kind: 'stun', amount: 0, crit: false, ...t.pos });
    }
    if (stuns.length) this.events.hits(stuns);
  }

  private tickTarget(t: CombatTarget, now: number): void {
    if (t.monster) {
      if (t.hp > 0) this.tickBurn(t, now);
      tickMonster(this, t as CombatTarget & { monster: MonsterState }, now);
      return;
    }
    if (t.hp === 0) {
      if (now >= t.resetAt) t.hp = t.maxHp;
      return;
    }
    if (t.hp < t.maxHp && now - t.lastHitAt >= DUMMY_RESET_AFTER_IDLE_MS && !t.burn) t.hp = t.maxHp;

    this.tickBurn(t, now);
    if (t.kind === 'sparring') this.tickSparring(t, now);
  }

  private tickBurn(t: CombatTarget, now: number): void {
    if (t.burn) {
      if (now >= t.burn.until) t.burn = null;
      else if (now >= t.burn.nextTickAt) {
        const dmg = computeDamage({ atk: SWORDSMAN_STATS.atk, skillCoef: SWORDSMAN.burn.coefPerTick, def: t.def, attackElement: 'fire', targetElements: t.elements, critChance: 0 }, this.rng);
        const source = t.burn.source;
        t.burn.nextTickAt += SWORDSMAN.burn.tickMs;
        this.events.hits([{ source, target: t.id, kind: 'burn', amount: dmg.amount, crit: false, ...t.pos }]);
        this.damageTarget(t, dmg.amount, now, source);
      }
    }
  }

  /** A target that swings back on a fixed rhythm with a telegraph, for testing dodge/parry/potion. */
  private tickSparring(t: CombatTarget, now: number): void {
    if (now < t.stunnedUntil) {
      t.nextAttackAt = Math.max(t.nextAttackAt, t.stunnedUntil + TELEGRAPH_MS);
      return;
    }
    if (!t.pendingAttack && now >= t.nextAttackAt - TELEGRAPH_MS) {
      const victim = this.nearestPlayer(t.pos, SPARRING_ATTACK.aggroRange);
      if (!victim) {
        t.nextAttackAt = now + SPARRING_ATTACK.periodMs;
        return;
      }
      const dx = victim.motion.x - t.pos.x;
      const dz = victim.motion.z - t.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      t.fx = dx / len;
      t.fz = dz / len;
      t.pendingAttack = { at: now + TELEGRAPH_MS, fx: t.fx, fz: t.fz };
      this.events.telegraph({ source: t.id, shape: SPARRING_ATTACK.shape, ...t.pos, fx: t.fx, fz: t.fz, durationMs: TELEGRAPH_MS });
      return;
    }
    if (t.pendingAttack && now >= t.pendingAttack.at) {
      const { fx, fz } = t.pendingAttack;
      t.pendingAttack = null;
      t.nextAttackAt = now + SPARRING_ATTACK.periodMs;
      this.hitPlayers(t.id, SPARRING_ATTACK.shape, t.pos, fx, fz, SPARRING_ATTACK.coef);
    }
  }

  // ------------------------------------------------- enemy side (MonsterHost)

  /**
   * An enemy attack area lands: every living player inside takes damage unless
   * dodging (i-frames, GDD 4.3) or parrying (counter 150%, GDD 5.2); sword
   * stance reduces it (x0.7). Damage and ปราณดาบ gain are server-side only.
   */
  hitPlayers(attackerId: string, shape: HitShape, origin: Vec3, fx: number, fz: number, coef: number): void {
    const attacker = this.targets.get(attackerId);
    if (!attacker) return;
    const hits: HitEvent[] = [];
    for (const p of this.players.values()) {
      if (p.dead || !inShape(shape, origin, fx, fz, p.motion)) continue;
      hits.push(...this.hitPlayer(p, attacker, coef));
    }
    if (hits.length) this.events.hits(hits);
  }

  private hitPlayer(p: CombatPlayer, attacker: CombatTarget, coef: number): HitEvent[] {
    const now = this.clock.now();
    if (isDodging(p.motion)) return [];
    if (now <= p.parryUntil) {
      // ปัดป้องสวนกลับ: no damage, counter for 150% ATK (GDD 5.2).
      p.parryUntil = 0;
      const counter = computeDamage({ atk: SWORDSMAN_STATS.atk, skillCoef: SWORDSMAN.parry.counterCoef, def: attacker.def, attackElement: SWORDSMAN.parry.element, targetElements: attacker.elements }, this.rng);
      const out: HitEvent[] = [
        { source: p.id, target: p.id, kind: 'parry', amount: 0, crit: false, ...pos(p.motion) },
        { source: p.id, target: attacker.id, kind: 'damage', amount: counter.amount, crit: counter.crit, ...attacker.pos },
      ];
      this.damageTarget(attacker, counter.amount, now, p.id);
      return out;
    }
    const dmg = computeDamage(
      {
        atk: attacker.atk,
        skillCoef: coef,
        def: SWORDSMAN_STATS.def,
        attackElement: attacker.elements[0] ?? 'smoke',
        targetElements: [SWORDSMAN_STATS.element],
        defenseMult: now < p.stanceUntil ? SWORDSMAN.stance.damageTakenMult : 1,
      },
      this.rng,
    );
    p.hp = Math.max(0, p.hp - dmg.amount);
    p.resource = Math.min(SWORDSMAN_STATS.resourceMax, p.resource + SWORDSMAN_STATS.resourceWhenHurt);
    if (p.hp === 0) {
      p.dead = true;
      p.respawnAt = now + SWORDSMAN_STATS.respawnMs;
    }
    return [{ source: attacker.id, target: p.id, kind: 'damage', amount: dmg.amount, crit: dmg.crit, ...pos(p.motion) }];
  }

  nearestPlayer(from: Vec3, range: number): CombatPlayer | null {
    let best: CombatPlayer | null = null;
    let bestD = range;
    for (const p of this.players.values()) {
      if (p.dead || Math.abs(p.motion.y - from.y) > 1.5) continue;
      const d = Math.hypot(p.motion.x - from.x, p.motion.z - from.z);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  playerPos(id: string): Vec3 | null {
    const p = this.players.get(id);
    return p && !p.dead ? p.motion : null;
  }

  telegraph(evt: TelegraphEvent): void {
    this.events.telegraph(evt);
  }

  spawnProjectile(ownerId: string, from: Vec3, fx: number, fz: number, speed: number, range: number, coef: number): void {
    const id = this.nextProjectileId++;
    this.projectiles.push({ id, owner: ownerId, pos: { ...from }, fx, fz, speed, remaining: range, coef });
    this.events.projectile({ id, source: ownerId, ...pos(from), vx: fx * speed, vz: fz * speed, range });
  }

  selfDestruct(id: string): void {
    const t = this.targets.get(id);
    if (t && t.hp > 0) this.killMonster(t, this.clock.now(), null);
  }

  private killMonster(t: CombatTarget, now: number, killer: string | null): void {
    const m = t.monster!;
    m.mode = 'dead';
    m.respawnAt = now + m.spec.respawnMs;
    m.windup = null;
    m.flurry = null;
    t.burn = null;
    t.hp = 0;
    // Monsters are purified, not destroyed (GDD pillar 1). Drops arrive with the inventory (Step 3.1).
    this.events.hits([{ source: killer ?? t.id, target: t.id, kind: 'death', amount: 0, crit: false, ...pos(t.pos) }]);
  }

  /** Moves projectiles and tests the swept segment of this tick against every player (GDD 8.3). */
  private tickProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i]!;
      const travel = Math.min(pr.remaining, pr.speed * TICK_DT);
      const from = pr.pos;
      const to = { x: from.x + pr.fx * travel, y: from.y, z: from.z + pr.fz * travel };
      let hit: CombatPlayer | null = null;
      for (const p of this.players.values()) {
        if (p.dead || Math.abs(p.motion.y - from.y) > 1.5) continue;
        if (segmentDistance(from, to, p.motion) <= PROJECTILE_RADIUS + PLAYER_HIT_RADIUS && !isDodging(p.motion)) {
          hit = p;
          break;
        }
      }
      pr.pos = to;
      pr.remaining -= travel;
      const owner = this.targets.get(pr.owner);
      if (hit && owner) {
        const evts = this.hitPlayer(hit, owner, pr.coef);
        if (evts.length) this.events.hits(evts);
      }
      if (hit || pr.remaining <= 1e-6) {
        this.projectiles.splice(i, 1);
        this.events.projectileEnd({ id: pr.id, hit: hit?.id ?? null });
      }
    }
  }
}

/** Distance on the ground plane from point p to segment a-b. */
function segmentDistance(a: Vec3, b: Vec3, p: Vec3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}

function pos(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}
