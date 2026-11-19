/**
 * Element table and damage constants (GDD 6). Server-only math reads these;
 * the client uses them for tooltips and colors only.
 */
export const ELEMENTS = ['fire', 'smoke', 'jade', 'dark'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Row = attacker, column = target (GDD 6.3). Never above 1.25. */
export const ELEMENT_MULT: Readonly<Record<Element, Readonly<Record<Element, number>>>> = {
  fire: { fire: 0.9, smoke: 0.8, jade: 1.25, dark: 1.0 },
  smoke: { fire: 1.25, smoke: 0.9, jade: 1.0, dark: 0.8 },
  jade: { fire: 0.8, smoke: 1.0, jade: 0.9, dark: 1.25 },
  dark: { fire: 1.0, smoke: 1.25, jade: 0.8, dark: 0.9 },
};

/**
 * Multiplier against a target with one or two elements. Corrupted enemies have
 * "dark" as a secondary element; with two elements the average is used (GDD 6.3).
 */
export function elementMultiplier(attacker: Element, target: readonly Element[]): number {
  if (target.length === 0) return 1;
  return target.reduce((sum, t) => sum + ELEMENT_MULT[attacker][t], 0) / target.length;
}

/** Crit chance and multiplier. Provisional (GDD 4.4). */
export const CRIT_CHANCE = 0.05;
export const CRIT_MULT = 1.5;

/** Elemental aura duration on a target (GDD 6.4). */
export const AURA_MS = 4000;
