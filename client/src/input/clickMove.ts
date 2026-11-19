import { containsXZ, heightAt, MOVE_AXIS_MAX, RUN_SPEED, SWORDSMAN, TICK_DT, type Axis, type Level, type Vec3 } from '@aranya/shared';

/**
 * Click-to-move (PC mouse / mobile tap). Purely an input helper: every tick it
 * turns "walk to this point" or "walk up to this monster" into the same
 * movement intent the keys produce, a direction (mx, mz) quantized to
 * integers. The server still runs the normal movement and collision, so this
 * cannot move the player anywhere the keys could not.
 *
 * There is no path finding yet: the player walks straight and stops when a
 * wall or cliff edge blocks it. Path finding comes with the baked navmesh
 * (tracker F-08).
 */

const firstHit = SWORDSMAN.attack.combo[0]!.shape;
/** Stop this close to a chased target so the first combo swing reaches it (m). */
export const MELEE_REACH = (firstHit.kind === 'arc' ? firstHit.radius : 2) - 0.5;

/** Distance under which a point order counts as reached: half a tick of walking. */
export const ARRIVE_DIST = (RUN_SPEED * TICK_DT) / 2;

/** Ticks without progress before an order gives up (blocked by a wall or edge). */
export const STUCK_TICKS = 6;

/**
 * Where a picking ray first meets a walkable floor (Level polygons), or null.
 * Uses the same polygons the server collides with, so a click always lands on
 * ground the movement code knows about, never on a tree or a sprite.
 */
export function groundHit(level: Level, origin: Vec3, dir: Vec3): Vec3 | null {
  let best: Vec3 | null = null;
  let bestT = Infinity;
  for (const poly of level.polys) {
    // The floor is a plane y = h(x, z), linear in x and z, so along the ray
    // h(t) = h0 + t * dh and the hit is where origin.y + t * dir.y = h(t).
    const h0 = heightAt(poly, origin.x, origin.z);
    const dh = heightAt(poly, origin.x + dir.x, origin.z + dir.z) - h0;
    const denom = dir.y - dh;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (h0 - origin.y) / denom;
    if (t <= 0 || t >= bestT) continue;
    const x = origin.x + dir.x * t;
    const z = origin.z + dir.z * t;
    if (!containsXZ(poly, x, z)) continue;
    bestT = t;
    best = { x, y: origin.y + dir.y * t, z };
  }
  return best;
}

/** Quantized direction from `from` to `to` on the ground plane, or null when within `stop`. */
export function steer(from: Vec3, to: { x: number; z: number }, stop: number): { mx: Axis; mz: Axis } | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= stop) return null;
  const mx = Math.round((dx / d) * MOVE_AXIS_MAX);
  const mz = Math.round((dz / d) * MOVE_AXIS_MAX);
  return mx === 0 && mz === 0 ? null : { mx, mz };
}

export type MoveOrder = { kind: 'point'; x: number; y: number; z: number } | { kind: 'target'; id: string };

export class ClickMove {
  order: MoveOrder | null = null;
  private last: Vec3 | null = null;
  private stuck = 0;

  moveTo(p: Vec3): void {
    this.order = { kind: 'point', x: p.x, y: p.y, z: p.z };
    this.reset();
  }

  chase(id: string): void {
    if (this.order?.kind === 'target' && this.order.id === id) return;
    this.order = { kind: 'target', id };
    this.reset();
  }

  cancel(): void {
    this.order = null;
  }

  get chasing(): string | null {
    return this.order?.kind === 'target' ? this.order.id : null;
  }

  private reset(): void {
    this.last = null;
    this.stuck = 0;
  }

  /**
   * Movement intent for this tick. Point orders end on arrival; target orders
   * stay (so the caller can keep attacking) and just stand still in reach.
   * `targetPos` returns null when the target is gone or dead, which ends the order.
   */
  tick(pos: Vec3, targetPos: (id: string) => Vec3 | null): { mx: Axis; mz: Axis } {
    const still = { mx: 0, mz: 0 };
    const o = this.order;
    if (!o) return still;
    const goal = o.kind === 'point' ? o : targetPos(o.id);
    if (!goal) {
      this.order = null;
      return still;
    }
    const dir = steer(pos, goal, o.kind === 'point' ? ARRIVE_DIST : MELEE_REACH);
    if (!dir) {
      if (o.kind === 'point') this.order = null;
      this.reset();
      return still;
    }
    // Blocked: no progress for a few ticks while trying to walk.
    if (this.last && Math.hypot(pos.x - this.last.x, pos.z - this.last.z) < 0.01) {
      if (++this.stuck >= STUCK_TICKS) {
        this.order = null;
        this.reset();
        return still;
      }
    } else {
      this.stuck = 0;
    }
    this.last = { ...pos };
    return dir;
  }

  /** True when the chased target is within melee reach of `pos`. */
  inReach(pos: Vec3, target: Vec3): boolean {
    return Math.hypot(target.x - pos.x, target.z - pos.z) <= MELEE_REACH + 0.05;
  }
}
