import { PLAYER_RADIUS, STEP_HEIGHT } from './constants.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A convex, planar walkable polygon. Polygons may overlap in XZ at different
 * heights (e.g. a bridge above a path); the mover picks the floor reachable
 * from its current height, so multi-level layouts work without explicit layers.
 * This is a stand-in for a baked navmesh (tracker F-08) with the same contract.
 */
export interface WalkPoly {
  id: string;
  /** Convex outline with consistent winding in XZ. */
  verts: readonly Vec3[];
  /**
   * Solid polygons have mass below them (terrain, platforms, ramps), so
   * nothing can walk underneath. Non-solid ones (bridges) can be walked under.
   */
  solid: boolean;
}

/** Vertical cylinder that blocks movement between yMin and yMax (trees, pillars). */
export interface CylinderObstacle {
  x: number;
  z: number;
  radius: number;
  yMin: number;
  yMax: number;
}

export interface Level {
  polys: readonly WalkPoly[];
  obstacles: readonly CylinderObstacle[];
  spawn: Vec3;
}

export function containsXZ(poly: WalkPoly, x: number, z: number): boolean {
  const v = poly.verts;
  let sign = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Height of the polygon's plane at (x, z). */
export function heightAt(poly: WalkPoly, x: number, z: number): number {
  const [a, b, c] = poly.verts as readonly [Vec3, Vec3, Vec3];
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return a.y - (nx * (x - a.x) + nz * (z - a.z)) / ny;
}

/** Unit normal of a polygon's plane, pointing up. */
export function normalOf(poly: WalkPoly): Vec3 {
  const [a, b, c] = poly.verts as readonly [Vec3, Vec3, Vec3];
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  const sign = ny < 0 ? -1 : 1;
  nx = (nx / len) * sign;
  ny = (ny / len) * sign;
  nz = (nz / len) * sign;
  return { x: nx, y: ny, z: nz };
}

/** The floor polygon a point stands on (closest in height), e.g. to align blob shadows. */
export function floorAt(level: Level, pos: Vec3): WalkPoly | null {
  let best: WalkPoly | null = null;
  let bestDist = Infinity;
  for (const poly of level.polys) {
    if (!containsXZ(poly, pos.x, pos.z)) continue;
    const d = Math.abs(heightAt(poly, pos.x, pos.z) - pos.y);
    if (d <= STEP_HEIGHT && d < bestDist) {
      best = poly;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Resolves the floor at (x, z) reachable from height `fromY`.
 * Returns the new position, or null if the move is blocked (cliff edge,
 * side of a solid poly, or obstacle). There is no falling: a floor more than
 * STEP_HEIGHT away is never reachable, so edges always block (Art Bible 10.12).
 */
export function resolveMove(level: Level, fromY: number, x: number, z: number): Vec3 | null {
  let best: number | null = null;
  for (const poly of level.polys) {
    if (!containsXZ(poly, x, z)) continue;
    const h = heightAt(poly, x, z);
    if (Math.abs(h - fromY) <= STEP_HEIGHT && (best === null || h > best)) best = h;
  }
  if (best === null) return null;

  for (const poly of level.polys) {
    if (!poly.solid || !containsXZ(poly, x, z)) continue;
    if (heightAt(poly, x, z) > best + STEP_HEIGHT) return null;
  }

  for (const o of level.obstacles) {
    if (best < o.yMin || best >= o.yMax) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const r = o.radius + PLAYER_RADIUS;
    if (dx * dx + dz * dz < r * r) return null;
  }

  return { x, y: best, z };
}
