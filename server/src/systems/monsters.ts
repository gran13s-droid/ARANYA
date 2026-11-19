import {
  MONSTERS,
  TICK_DT,
  fleeSpeed,
  resolveMove,
  type HitShape,
  type Level,
  type MonsterId,
  type MonsterSpec,
  type TelegraphEvent,
  type Vec3,
} from '@aranya/shared';

/**
 * Server-side monster brain (ROADMAP 1.3): idle -> wander -> chase -> attack ->
 * return, plus Lost Mom's retreat/flee (GDD 8.3), Fire Fowl's 3-peck flurry and
 * Khamod's self-destruct. Every attack shows its telegraph first (>= 1.0 s,
 * GDD 4.3); the direction is locked when the telegraph starts, so what the
 * player sees is what hits.
 */

export type MonsterMode = 'idle' | 'wander' | 'chase' | 'windup' | 'flurry' | 'retreat' | 'flee' | 'return' | 'dead';

export interface MonsterState {
  spec: MonsterSpec;
  spawn: Vec3;
  mode: MonsterMode;
  targetId: string | null;
  /** Taunted by ยืนม้าหยก: must target this player until `until` (GDD 5.2). */
  taunt: { id: string; until: number } | null;
  wanderTo: Vec3 | null;
  nextWanderAt: number;
  nextAttackAt: number;
  retreatReadyAt: number;
  modeUntil: number;
  fleeUsed: boolean;
  /** Set when hit; Lost Mom steps back in reaction. */
  hurtAt: number;
  windup: { impactAt: number; fx: number; fz: number } | null;
  flurry: { hitsLeft: number; nextHitAt: number; fx: number; fz: number } | null;
  respawnAt: number;
}

/** What the brain needs from the combat world. */
export interface MonsterHost {
  readonly level: Level;
  readonly rng: () => number;
  nearestPlayer(from: Vec3, range: number): { id: string; motion: Vec3 } | null;
  playerPos(id: string): Vec3 | null;
  telegraph(evt: TelegraphEvent): void;
  /** Applies an enemy hit to every player in the area (handles i-frames, parry, stance). */
  hitPlayers(attackerId: string, shape: HitShape, origin: Vec3, fx: number, fz: number, coef: number): void;
  spawnProjectile(ownerId: string, from: Vec3, fx: number, fz: number, speed: number, range: number, coef: number): void;
  /** The monster removes itself (Khamod explodes). */
  selfDestruct(id: string): void;
}

/** Fields of CombatTarget the brain reads and writes. */
export interface MonsterBody {
  id: string;
  pos: Vec3;
  fx: number;
  fz: number;
  hp: number;
  maxHp: number;
  stunnedUntil: number;
  monster: MonsterState;
}

export function createMonsterState(species: MonsterId, spawn: Vec3, now: number): MonsterState {
  return {
    spec: MONSTERS[species],
    spawn: { ...spawn },
    mode: 'idle',
    targetId: null,
    taunt: null,
    wanderTo: null,
    nextWanderAt: now + 1000,
    nextAttackAt: 0,
    retreatReadyAt: 0,
    modeUntil: 0,
    fleeUsed: false,
    hurtAt: 0,
    windup: null,
    flurry: null,
    respawnAt: 0,
  };
}

const dist2d = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

function face(m: MonsterBody, dx: number, dz: number): void {
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) {
    m.fx = dx / len;
    m.fz = dz / len;
  }
}

/** Moves along the walk mesh towards a point; returns true when it arrived. */
function moveToward(host: MonsterHost, m: MonsterBody, dest: Vec3, speed: number, stopAt = 0.1): boolean {
  const dx = dest.x - m.pos.x;
  const dz = dest.z - m.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= stopAt) return true;
  face(m, dx, dz);
  const step = Math.min(d - stopAt, speed * TICK_DT);
  const nx = m.pos.x + m.fx * step;
  const nz = m.pos.z + m.fz * step;
  const moved =
    resolveMove(host.level, m.pos.y, nx, nz) ??
    resolveMove(host.level, m.pos.y, nx, m.pos.z) ??
    resolveMove(host.level, m.pos.y, m.pos.x, nz);
  if (moved) m.pos = moved;
  return d - step <= stopAt;
}

/** Hit by a player: remember the attacker (unless fleeing or going home). */
export function onMonsterHurt(m: MonsterBody, attackerId: string, now: number): void {
  const s = m.monster;
  s.hurtAt = now;
  if (s.mode !== 'flee' && s.mode !== 'return' && !s.targetId) s.targetId = attackerId;
}

export function tickMonster(host: MonsterHost, m: MonsterBody, now: number): void {
  const s = m.monster;
  const spec = s.spec;

  if (s.mode === 'dead') {
    if (now >= s.respawnAt) {
      Object.assign(s, createMonsterState(spec.id, s.spawn, now));
      m.pos = { ...s.spawn };
      m.hp = m.maxHp;
    }
    return;
  }
  if (now < m.stunnedUntil) {
    // Stun cancels a wind-up (ทะยานพยัคฆ์ interrupts, GDD 5.2).
    s.windup = null;
    s.flurry = null;
    if (s.mode === 'windup' || s.mode === 'flurry') s.mode = 'chase';
    return;
  }

  // Leash: too far from home -> walk back and heal (GDD 8.3).
  if (s.mode !== 'return' && dist2d(m.pos, s.spawn) > spec.leashRange) {
    s.mode = 'return';
    s.targetId = null;
    s.windup = null;
    s.flurry = null;
  }
  if (s.mode === 'return') {
    if (moveToward(host, m, s.spawn, spec.moveSpeed * 1.5)) {
      m.hp = m.maxHp;
      s.mode = 'idle';
      s.fleeUsed = false;
    }
    return;
  }

  // Lost Mom: flee once below 30% HP for 4 s, no attacks meanwhile (GDD 8.3).
  if (spec.flee && !s.fleeUsed && m.hp < m.maxHp * spec.flee.belowHpPct) {
    s.fleeUsed = true;
    s.mode = 'flee';
    s.modeUntil = now + spec.flee.durationMs;
    s.windup = null;
  }
  if (s.mode === 'flee') {
    const threat = host.nearestPlayer(m.pos, 30);
    if (threat) {
      const away = { x: m.pos.x * 2 - threat.motion.x, y: m.pos.y, z: m.pos.z * 2 - threat.motion.z };
      moveToward(host, m, away, fleeSpeed(spec));
    }
    if (now >= s.modeUntil) s.mode = 'chase';
    return;
  }

  // Attacks already in progress finish first.
  if (s.windup) {
    if (now >= s.windup.impactAt) {
      const { fx, fz } = s.windup;
      s.windup = null;
      resolveAttack(host, m, fx, fz, now);
    }
    return;
  }
  if (s.flurry) {
    if (now >= s.flurry.nextHitAt) {
      host.hitPlayers(m.id, spec.attack.shape, m.pos, s.flurry.fx, s.flurry.fz, spec.attack.coef);
      s.flurry.hitsLeft -= 1;
      s.flurry.nextHitAt = now + (spec.attack.hitGapMs ?? 200);
      if (s.flurry.hitsLeft <= 0) {
        s.flurry = null;
        s.mode = 'chase';
      }
    }
    return;
  }

  // Lost Mom steps back when hit (once per cooldown), then shoots.
  if (s.mode === 'retreat') {
    const t = s.targetId ? host.playerPos(s.targetId) : null;
    if (t) {
      const away = { x: m.pos.x * 2 - t.x, y: m.pos.y, z: m.pos.z * 2 - t.z };
      moveToward(host, m, away, (spec.retreat!.distance / spec.retreat!.durationMs) * 1000);
      face(m, t.x - m.pos.x, t.z - m.pos.z);
    }
    if (now >= s.modeUntil) s.mode = 'chase';
    return;
  }
  if (spec.retreat && s.hurtAt > 0 && now - s.hurtAt < 200 && now >= s.retreatReadyAt) {
    s.mode = 'retreat';
    s.modeUntil = now + spec.retreat.durationMs;
    s.retreatReadyAt = now + spec.retreat.cooldownMs;
    return;
  }

  // Pick a target: taunt first, then the current target, then aggro range.
  if (s.taunt && (now >= s.taunt.until || !host.playerPos(s.taunt.id))) s.taunt = null;
  if (s.taunt) s.targetId = s.taunt.id;
  let target = s.targetId ? host.playerPos(s.targetId) : null;
  if (s.targetId && !target) s.targetId = null;
  if (!target && spec.aggroRange > 0) {
    const near = host.nearestPlayer(m.pos, spec.aggroRange);
    if (near) {
      s.targetId = near.id;
      target = near.motion;
    }
  }

  if (!target) {
    wander(host, m, now);
    return;
  }

  s.mode = 'chase';
  const d = dist2d(m.pos, target);
  if (d <= spec.attack.range && now >= s.nextAttackAt) {
    startWindup(host, m, target, now);
    return;
  }
  // Ranged monsters keep their distance; melee ones close in.
  const keep = spec.attack.kind === 'projectile' ? spec.attack.range * 0.8 : spec.attack.range * 0.8;
  if (d > keep) moveToward(host, m, target, spec.moveSpeed, keep);
  else face(m, target.x - m.pos.x, target.z - m.pos.z);
}

function wander(host: MonsterHost, m: MonsterBody, now: number): void {
  const s = m.monster;
  s.mode = 'wander';
  if (!s.wanderTo && now >= s.nextWanderAt) {
    const a = host.rng() * Math.PI * 2;
    const r = host.rng() * s.spec.wanderRadius;
    s.wanderTo = { x: s.spawn.x + Math.cos(a) * r, y: s.spawn.y, z: s.spawn.z + Math.sin(a) * r };
  }
  if (s.wanderTo && moveToward(host, m, s.wanderTo, s.spec.moveSpeed * 0.5)) {
    s.wanderTo = null;
    s.nextWanderAt = now + 2500 + host.rng() * 3000;
  }
}

function startWindup(host: MonsterHost, m: MonsterBody, target: Vec3, now: number): void {
  const s = m.monster;
  const atk = s.spec.attack;
  face(m, target.x - m.pos.x, target.z - m.pos.z);
  s.mode = 'windup';
  s.windup = { impactAt: now + atk.telegraphMs, fx: m.fx, fz: m.fz };
  s.nextAttackAt = now + atk.telegraphMs + atk.cooldownMs;
  host.telegraph({ source: m.id, shape: atk.shape, ...m.pos, fx: m.fx, fz: m.fz, durationMs: atk.telegraphMs });
}

function resolveAttack(host: MonsterHost, m: MonsterBody, fx: number, fz: number, now: number): void {
  const s = m.monster;
  const atk = s.spec.attack;
  switch (atk.kind) {
    case 'projectile':
      host.spawnProjectile(m.id, m.pos, fx, fz, atk.speed ?? 6, atk.shape.kind === 'line' ? atk.shape.length : atk.range, atk.coef);
      s.mode = 'chase';
      return;
    case 'melee':
      s.mode = 'flurry';
      s.flurry = { hitsLeft: atk.hits ?? 1, nextHitAt: now, fx, fz };
      return;
    case 'explode':
      host.hitPlayers(m.id, atk.shape, m.pos, fx, fz, atk.coef);
      host.selfDestruct(m.id);
      return;
  }
}
