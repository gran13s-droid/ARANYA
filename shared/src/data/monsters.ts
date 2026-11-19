import type { HitShape } from '../combat/shapes.ts';
import { RUN_SPEED } from '../constants.ts';
import type { Element } from './elements.ts';

/**
 * Zone 1 monsters for Step 1.3 (GDD 8.3). The server AI reads these; the client
 * only uses names and sizes for display. Lost Mom follows the detailed rules in
 * GDD 8.3; values marked provisional are listed in GDD 4.4.
 */
export type MonsterId = 'lostMom' | 'fireFowl' | 'khamod';

export interface MonsterAttack {
  kind: 'projectile' | 'melee' | 'explode';
  /** Ground warning before the hit; at least 1000 ms for enemy attacks (GDD 4.3). */
  telegraphMs: number;
  shape: HitShape;
  coef: number;
  cooldownMs: number;
  /** Starts the attack when the target is this close. */
  range: number;
  /** Melee: number of hits in the flurry and gap between them (Fire Fowl pecks 3 times). */
  hits?: number;
  hitGapMs?: number;
  /** Projectile speed in m/s. */
  speed?: number;
}

export interface MonsterSpec {
  id: MonsterId;
  level: number;
  elements: Element[];
  /** Provisional stats. */
  maxHp: number;
  atk: number;
  def: number;
  moveSpeed: number;
  /** 0 = never attacks first (only when hit). */
  aggroRange: number;
  /** Return to spawn and heal when this far from it (GDD 8.3: 15 m). */
  leashRange: number;
  wanderRadius: number;
  attack: MonsterAttack;
  /** Lost Mom: step back before shooting, once per cooldown. */
  retreat?: { distance: number; durationMs: number; cooldownMs: number };
  /** Lost Mom: run away below this HP fraction. */
  flee?: { belowHpPct: number; durationMs: number; speedMul: number };
  /** Floats above the ground (visual only). */
  hoverM?: number;
  respawnMs: number;
  /** Item dropped on death (GDD 8.3); granted once an inventory exists (Step 3.1). */
  drop: string;
}

export const MONSTERS: Readonly<Record<MonsterId, MonsterSpec>> = {
  // GDD 8.3 "พฤติกรรมละเอียด: ลูกมอมหลงทาง".
  lostMom: {
    id: 'lostMom',
    level: 2,
    elements: ['jade'],
    maxHp: 220,
    atk: 30,
    def: 10,
    moveSpeed: 2.5,
    aggroRange: 0,
    leashRange: 15,
    wanderRadius: 4,
    attack: { kind: 'projectile', telegraphMs: 1000, shape: { kind: 'line', length: 8, width: 1 }, coef: 1.0, cooldownMs: 4000, range: 8, speed: 6 },
    retreat: { distance: 3, durationMs: 500, cooldownMs: 6000 },
    flee: { belowHpPct: 0.3, durationMs: 4000, speedMul: 1.2 },
    hoverM: 0.3,
    respawnMs: 10_000,
    drop: 'wan_powder',
  },
  // Attacks first, pecks 3 times (GDD 8.3). Provisional numbers.
  fireFowl: {
    id: 'fireFowl',
    level: 4,
    elements: ['fire'],
    maxHp: 320,
    atk: 34,
    def: 20,
    moveSpeed: 3.5,
    aggroRange: 6,
    leashRange: 15,
    wanderRadius: 4,
    attack: { kind: 'melee', telegraphMs: 1000, shape: { kind: 'arc', radius: 1.8, angleDeg: 90 }, coef: 0.45, cooldownMs: 3500, range: 1.6, hits: 3, hitGapMs: 220 },
    respawnMs: 10_000,
    drop: 'fowl_feather',
  },
  // Floats in, then blows itself up with a 1.2 s warning (GDD 8.3). Provisional numbers.
  khamod: {
    id: 'khamod',
    level: 5,
    elements: ['fire'],
    maxHp: 180,
    atk: 45,
    def: 10,
    moveSpeed: 2.2,
    aggroRange: 7,
    leashRange: 15,
    wanderRadius: 5,
    attack: { kind: 'explode', telegraphMs: 1200, shape: { kind: 'circle', radius: 2.5 }, coef: 2.0, cooldownMs: 0, range: 1.8 },
    hoverM: 0.8,
    respawnMs: 15_000,
    drop: 'khamod_core',
  },
};

/** Lost Mom flees at 1.2x the player's speed (GDD 8.3). */
export const fleeSpeed = (spec: MonsterSpec): number => (spec.flee ? RUN_SPEED * spec.flee.speedMul : spec.moveSpeed);
