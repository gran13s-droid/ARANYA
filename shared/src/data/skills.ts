import type { HitShape } from '../combat/shapes.ts';
import type { Element } from './elements.ts';
import { PLAYER_ANIMS, impactMs, type PlayerAnim } from './animations.ts';

/**
 * Swordsman kit (GDD 5.2) and the 7-slot hotbar (GDD 4.3). Values that the GDD
 * does not specify yet are marked "provisional" and listed in GDD 4.4.
 * Both sides read this file: the server for rules, the client for UI and
 * optimistic animation. Hit timing comes from PLAYER_ANIMS via impactMs(),
 * so animation and damage can never drift apart (CLAUDE.md).
 */

/**
 * Hotbar keys 1-7 (GDD 4.3): attack | skill 2 | skill 3 | skill 4 | ultimate | HP potion | mana potion.
 * Dodge is not on the hotbar; it has its own key (Space).
 */
export const HOTBAR = ['attack', 'stance', 'lunge', 'parry', 'ultimate', 'potion', 'manaPotion'] as const;
export type HotbarSkill = (typeof HOTBAR)[number];
export type SkillId = HotbarSkill | 'dodge';

/** Skills sent as cast messages; dodge and lunge travel inside movement input instead. */
export type CastSkillId = Exclude<SkillId, 'dodge' | 'lunge'>;
export const CAST_SKILLS: readonly CastSkillId[] = ['attack', 'stance', 'parry', 'ultimate', 'potion', 'manaPotion'];

export interface ComboHit {
  anim: Extract<PlayerAnim, 'attack1' | 'attack2' | 'attack3'>;
  /** Provisional. */
  coef: number;
  shape: HitShape;
  appliesBurn?: boolean;
}

/** Provisional base stats for a level-1 swordsman. */
export const SWORDSMAN_STATS = {
  maxHp: 500,
  atk: 50,
  def: 30,
  element: 'fire' as Element,
  /** ปราณดาบ (GDD 5.1). */
  resourceMax: 100,
  /** GDD 5.2: +10 per landed combo hit. */
  resourcePerHit: 10,
  /** Provisional: gained when taking damage (GDD 5.1 says it builds when hit). */
  resourceWhenHurt: 5,
  respawnMs: 3000,
} as const;

const SWORD_ARC: HitShape = { kind: 'arc', radius: 2.2, angleDeg: 120 };

export const SWORDSMAN = {
  attack: {
    element: 'fire' as Element,
    cooldownMs: 0,
    combo: [
      { anim: 'attack1', coef: 0.8, shape: SWORD_ARC },
      { anim: 'attack2', coef: 0.9, shape: SWORD_ARC },
      { anim: 'attack3', coef: 1.4, shape: { kind: 'arc', radius: 2.4, angleDeg: 150 }, appliesBurn: true },
    ] satisfies ComboHit[],
    /** Provisional: the next press must come within this time after a swing ends to continue the combo. */
    comboWindowMs: 600,
  },
  /** Burn status from combo hit 3 (GDD 5.2: 4 s). Damage per second is provisional. */
  burn: { durationMs: 4000, tickMs: 1000, coefPerTick: 0.1 },
  stance: { element: 'jade' as Element, cooldownMs: 20_000, durationMs: 12_000, damageTakenMult: 0.7, moveMult: 0.8, tauntRadius: 6, anim: 'skill' as PlayerAnim },
  lunge: { element: 'fire' as Element, cooldownMs: 10_000, distance: 8, durationMs: 300, stunMs: 1000, hitRadius: 1.2 },
  parry: { element: 'jade' as Element, cooldownMs: 8000, windowMs: 400, latencyGraceMaxMs: 120, counterCoef: 1.5, anim: 'skill' as PlayerAnim },
  ultimate: {
    element: 'fire' as Element,
    cooldownMs: 90_000,
    resourceCost: 100,
    coef: 4.0,
    shape: { kind: 'arc', radius: 6, angleDeg: 120 } as HitShape,
    corruptedBonus: 0.2,
    anim: 'skill' as PlayerAnim,
  },
  dodge: { cooldownMs: 6000, distance: 4, durationMs: 250 },
  /** Provisional. */
  potion: { cooldownMs: 15_000, healPct: 0.3 },
  /** Provisional: restores mana (the swordsman's resource, GDD 5.1 ปราณดาบ, shown as "Mana"). */
  manaPotion: { cooldownMs: 15_000, restore: 50 },
} as const;

/** Cooldown (ms) of any hotbar skill, for UI and validation. */
export function cooldownOf(skill: SkillId): number {
  return SWORDSMAN[skill].cooldownMs;
}

/** Time from cast to damage for an animation-driven skill. */
export function hitDelayMs(anim: PlayerAnim): number {
  return impactMs(PLAYER_ANIMS[anim]) ?? 0;
}

/** Length of the swing/cast animation; the next action waits for it. */
export function actionLockMs(anim: PlayerAnim): number {
  return PLAYER_ANIMS[anim].durationMs;
}
