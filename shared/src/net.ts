import { normalizeFacing, type HitShape } from './combat/shapes.ts';
import type { PlayerAnim } from './data/animations.ts';
import { CAST_SKILLS, type CastSkillId } from './data/skills.ts';

/** Name of the zone room registered on the server. */
export const ZONE_ROOM = 'zone';

export const Msg = {
  /** client -> server, every tick: movement intent (+ dodge / lunge). */
  Input: 'input',
  /** client -> server: use a hotbar skill. */
  Cast: 'cast',
  /** server -> client: RTT probe; the client echoes it back as Pong. */
  Ping: 'ping',
  Pong: 'pong',
  /** server -> caster: accepted or rejected cast. */
  CastAck: 'castAck',
  /** server -> others: someone started a skill (for animation). */
  CastStarted: 'castStarted',
  /** server -> all: damage, heals, parries, stuns. */
  Hits: 'hits',
  /** server -> all: ground warning before an enemy attack (GDD 4.3: at least 1.0 s). */
  Telegraph: 'telegraph',
  /** server -> all: an enemy projectile was fired (client animates it; the server decides hits). */
  Projectile: 'projectile',
  ProjectileEnd: 'projectileEnd',
} as const;

export interface ProjectileEvent {
  id: number;
  source: string;
  x: number;
  y: number;
  z: number;
  /** Velocity on the ground plane, m/s. */
  vx: number;
  vz: number;
  /** Max travel distance in m. */
  range: number;
}

export interface ProjectileEndEvent {
  id: number;
  /** Player hit, if any. */
  hit: string | null;
}

export type Axis = -1 | 0 | 1;

/** Sequence numbers are synced back as uint32 (server/src/state.ts), so they must fit in it. */
export const MAX_INPUT_SEQ = 0xffff_ffff;

/**
 * Movement intent for one simulation tick. The client never sends positions,
 * only which direction keys are held and whether dodge/lunge was pressed
 * (server-authoritative movement).
 */
export interface InputMessage {
  /** Monotonic per-client sequence number, used for reconciliation. */
  seq: number;
  /** East (+1) / west (-1). */
  mx: Axis;
  /** North (+1) / south (-1). */
  mz: Axis;
  /** 0 none, 1 dodge, 2 lunge (see MotionAct). */
  act?: 0 | 1 | 2;
}

export interface CastMessage {
  seq: number;
  skill: CastSkillId;
  /** Aim direction on the ground plane; normalized by the server. */
  fx: number;
  fz: number;
}

export interface CastAck {
  seq: number;
  skill: CastSkillId;
  ok: boolean;
  /** Why it was rejected (cooldown, resource, busy, dead). */
  reason?: string;
  /** Combo step that was played (1..3) for attacks. */
  comboStep?: number;
  /** Cooldown in ms that started now, so the client can draw it. */
  cooldownMs?: number;
}

export interface CastStarted {
  id: string;
  skill: CastSkillId;
  anim: PlayerAnim;
  fx: number;
  fz: number;
}

/** `death`: a monster was defeated (purified, GDD 8.3); `taunt`: monsters now target the player. */
export type HitKind = 'damage' | 'heal' | 'mana' | 'parry' | 'stun' | 'burn' | 'death' | 'taunt';

export interface HitEvent {
  source: string;
  target: string;
  kind: HitKind;
  amount: number;
  crit: boolean;
  x: number;
  y: number;
  z: number;
}

export interface TelegraphEvent {
  source: string;
  shape: HitShape;
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
  /** Time until the hit lands. */
  durationMs: number;
}

function isAxis(v: unknown): v is Axis {
  return v === -1 || v === 0 || v === 1;
}

function isSeq(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_INPUT_SEQ;
}

/** Validates an untrusted payload received from a client. */
export function parseInput(payload: unknown): InputMessage | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { seq, mx, mz, act } = payload as Record<string, unknown>;
  if (!isSeq(seq)) return null;
  if (!isAxis(mx) || !isAxis(mz)) return null;
  if (act !== undefined && act !== 0 && act !== 1 && act !== 2) return null;
  return act ? { seq, mx, mz, act } : { seq, mx, mz };
}

export function parseCast(payload: unknown): CastMessage | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { seq, skill, fx, fz } = payload as Record<string, unknown>;
  if (!isSeq(seq)) return null;
  if (typeof skill !== 'string' || !(CAST_SKILLS as readonly string[]).includes(skill)) return null;
  if (typeof fx !== 'number' || typeof fz !== 'number' || !Number.isFinite(fx) || !Number.isFinite(fz)) return null;
  const f = normalizeFacing(fx, fz);
  return { seq, skill: skill as CastSkillId, fx: f.fx, fz: f.fz };
}
