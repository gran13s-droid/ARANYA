import { RUN_SPEED, TICK_DT, TICK_MS } from './constants.ts';
import { SWORDSMAN } from './data/skills.ts';
import type { InputMessage } from './net.ts';
import { resolveMove, type Level, type Vec3 } from './walkmesh.ts';

/** Movement actions carried in the input stream (deterministic on both sides). */
export const MotionAct = { None: 0, Dodge: 1, Lunge: 2 } as const;
export type MotionAct = (typeof MotionAct)[keyof typeof MotionAct];

/**
 * Everything the shared movement simulation needs. The server owns the truth;
 * the client runs the same stepMotion() for prediction and replay, so dashes
 * and their cooldowns predict exactly like walking.
 */
export interface Motion extends Vec3 {
  /** Last movement or dash direction (unit vector), used to aim dashes. */
  fx: number;
  fz: number;
  dashKind: MotionAct;
  dashTicks: number;
  dodgeCdTicks: number;
  lungeCdTicks: number;
  /** Walk speed multiplier from buffs/debuffs (e.g. sword stance 0.8); set by the server. */
  speedMul: number;
}

export const toTicks = (ms: number): number => Math.round(ms / TICK_MS);
const DODGE_TICKS = toTicks(SWORDSMAN.dodge.durationMs);
const LUNGE_TICKS = toTicks(SWORDSMAN.lunge.durationMs);
const DODGE_STEP = SWORDSMAN.dodge.distance / DODGE_TICKS;
const LUNGE_STEP = SWORDSMAN.lunge.distance / LUNGE_TICKS;
export const DODGE_CD_TICKS = toTicks(SWORDSMAN.dodge.cooldownMs);
export const LUNGE_CD_TICKS = toTicks(SWORDSMAN.lunge.cooldownMs);

export function initialMotion(pos: Vec3): Motion {
  return { x: pos.x, y: pos.y, z: pos.z, fx: 0, fz: -1, dashKind: MotionAct.None, dashTicks: 0, dodgeCdTicks: 0, lungeCdTicks: 0, speedMul: 1 };
}

/** Moves along the floor, sliding on walls; returns the original position if fully blocked. */
function slide(level: Level, pos: Vec3, dx: number, dz: number): Vec3 {
  return (
    resolveMove(level, pos.y, pos.x + dx, pos.z + dz) ??
    (dx !== 0 ? resolveMove(level, pos.y, pos.x + dx, pos.z) : null) ??
    (dz !== 0 ? resolveMove(level, pos.y, pos.x, pos.z + dz) : null) ??
    pos
  );
}

/** True while a dodge grants invulnerability (GDD 4.3: 0.25 s of i-frames). */
export function isDodging(m: Motion): boolean {
  return m.dashKind === MotionAct.Dodge && m.dashTicks > 0;
}

/**
 * One simulation tick: cooldowns, starting a dodge/lunge (if off cooldown and
 * not already dashing), dash travel, or normal walking. Dashes use the same
 * collision as walking, so they stop at walls and never leave a floor.
 */
export function stepMotion(level: Level, m: Motion, input: Pick<InputMessage, 'mx' | 'mz'> & { act?: MotionAct }): Motion {
  const next: Motion = { ...m, dodgeCdTicks: Math.max(0, m.dodgeCdTicks - 1), lungeCdTicks: Math.max(0, m.lungeCdTicks - 1) };
  const moving = input.mx !== 0 || input.mz !== 0;
  if (moving) {
    const inv = 1 / Math.hypot(input.mx, input.mz);
    next.fx = input.mx * inv;
    next.fz = input.mz * inv;
  }

  if (next.dashTicks === 0) {
    if (input.act === MotionAct.Dodge && next.dodgeCdTicks === 0) {
      next.dashKind = MotionAct.Dodge;
      next.dashTicks = DODGE_TICKS;
      next.dodgeCdTicks = DODGE_CD_TICKS;
    } else if (input.act === MotionAct.Lunge && next.lungeCdTicks === 0) {
      next.dashKind = MotionAct.Lunge;
      next.dashTicks = LUNGE_TICKS;
      next.lungeCdTicks = LUNGE_CD_TICKS;
    }
  }

  if (next.dashTicks > 0) {
    const step = next.dashKind === MotionAct.Dodge ? DODGE_STEP : LUNGE_STEP;
    const pos = slide(level, next, next.fx * step, next.fz * step);
    next.dashTicks -= 1;
    if (next.dashTicks === 0) next.dashKind = MotionAct.None;
    return { ...next, x: pos.x, y: pos.y, z: pos.z };
  }

  if (!moving) return next;
  const dist = RUN_SPEED * next.speedMul * TICK_DT;
  const pos = slide(level, next, next.fx * dist, next.fz * dist);
  return { ...next, x: pos.x, y: pos.y, z: pos.z };
}
