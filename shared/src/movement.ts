import { RUN_SPEED, TICK_DT } from './constants.ts';
import type { InputMessage } from './net.ts';
import { resolveMove, type Level, type Vec3 } from './walkmesh.ts';

/**
 * Advances a player by exactly one simulation tick.
 * Pure and deterministic: the server runs it authoritatively and the client
 * runs the same function for prediction and reconciliation replay.
 */
export function stepPlayer(level: Level, pos: Vec3, input: Pick<InputMessage, 'mx' | 'mz'>): Vec3 {
  const { mx, mz } = input;
  if (mx === 0 && mz === 0) return pos;

  const inv = 1 / Math.hypot(mx, mz);
  const dist = RUN_SPEED * TICK_DT;
  const dx = mx * inv * dist;
  const dz = mz * inv * dist;

  // Try the full move, then slide along each axis so walls do not stop the player dead.
  return (
    resolveMove(level, pos.y, pos.x + dx, pos.z + dz) ??
    (dx !== 0 ? resolveMove(level, pos.y, pos.x + dx, pos.z) : null) ??
    (dz !== 0 ? resolveMove(level, pos.y, pos.x, pos.z + dz) : null) ??
    pos
  );
}
