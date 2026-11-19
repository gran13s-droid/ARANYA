import { CRIT_CHANCE, CRIT_MULT, elementMultiplier, type Element } from '../data/elements.ts';

export interface DamageInput {
  atk: number;
  skillCoef: number;
  def: number;
  attackElement: Element;
  targetElements: readonly Element[];
  /** Element reaction multiplier (GDD 6.4); 1 when no reaction. */
  reactionMult?: number;
  /** Target-state multiplier, e.g. boss coil 0.2 or sword stance 0.7 (GDD 6.5). */
  defenseMult?: number;
  /** Extra situational multiplier, e.g. +20% vs corrupted for the ultimate. */
  bonusMult?: number;
  critChance?: number;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  elemMult: number;
}

/**
 * GDD 6.5 damage formula. Server-only: `rng` must be the room's seeded RNG.
 * raw = ATK x coef; mitigated = raw x 100/(100+DEF);
 * final = mitigated x elem x crit x reaction x defense x random(0.95, 1.05), at least 1.
 */
export function computeDamage(input: DamageInput, rng: () => number): DamageResult {
  const raw = input.atk * input.skillCoef;
  const mitigated = raw * (100 / (100 + Math.max(0, input.def)));
  const elemMult = elementMultiplier(input.attackElement, input.targetElements);
  const crit = rng() < (input.critChance ?? CRIT_CHANCE);
  const variance = 0.95 + rng() * 0.1;
  const final =
    mitigated *
    elemMult *
    (crit ? CRIT_MULT : 1) *
    (input.reactionMult ?? 1) *
    (input.defenseMult ?? 1) *
    (input.bonusMult ?? 1) *
    variance;
  return { amount: Math.max(1, Math.round(final)), crit, elemMult };
}
