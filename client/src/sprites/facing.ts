import type { DrawnDir, FacingDir } from '@aranya/shared';

/** How much one axis must dominate before a diagonal snaps to it. */
const DOMINANCE = 1.2;

/**
 * Picks one of the 4 facings from a movement vector (+x east, +z north).
 * On true diagonals the previous facing is kept if it is one of the two
 * components (no flicker); otherwise the side view wins because it reads best.
 */
export function facingFromMove(dx: number, dz: number, previous: FacingDir, deadzone = 1e-4): FacingDir {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (ax < deadzone && az < deadzone) return previous;
  const horizontal: FacingDir = dx > 0 ? 'E' : 'W';
  const vertical: FacingDir = dz > 0 ? 'N' : 'S';
  if (az < deadzone || ax > az * DOMINANCE) return horizontal;
  if (ax < deadzone || az > ax * DOMINANCE) return vertical;
  return previous === horizontal || previous === vertical ? previous : horizontal;
}

/** W is not drawn: it is E mirrored (Art Bible 4.1). */
export function toDrawn(facing: FacingDir): { dir: DrawnDir; mirror: boolean } {
  return facing === 'W' ? { dir: 'E', mirror: true } : { dir: facing, mirror: false };
}
