import type { Vec3 } from '../walkmesh.ts';

/**
 * Hit areas, tested on the ground plane plus a height band so an attack on an
 * upper floor never hits someone underneath (Art Bible 10.12).
 */
export const HIT_HEIGHT_TOLERANCE = 1.5;

export type HitShape =
  /** Sector in front of the caster: radius in m, full angle in degrees. */
  | { kind: 'arc'; radius: number; angleDeg: number }
  | { kind: 'circle'; radius: number }
  /** Rectangle starting at the caster going forward. */
  | { kind: 'line'; length: number; width: number };

/** Target collision radius added to every shape test. */
export const TARGET_RADIUS = 0.5;

/**
 * Whether `target` is inside `shape` cast from `origin` facing (fx, fz).
 * Facing must be a unit vector on the XZ plane.
 */
export function inShape(shape: HitShape, origin: Vec3, fx: number, fz: number, target: Vec3, targetRadius = TARGET_RADIUS): boolean {
  if (Math.abs(target.y - origin.y) > HIT_HEIGHT_TOLERANCE) return false;
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dist = Math.hypot(dx, dz);
  switch (shape.kind) {
    case 'circle':
      return dist <= shape.radius + targetRadius;
    case 'arc': {
      if (dist > shape.radius + targetRadius) return false;
      if (dist <= targetRadius) return true;
      const cos = (dx * fx + dz * fz) / dist;
      const half = (shape.angleDeg / 2) * (Math.PI / 180);
      // Widen the cone by the target's angular radius so edge hits feel fair.
      const slack = Math.asin(Math.min(1, targetRadius / dist));
      return Math.acos(Math.max(-1, Math.min(1, cos))) <= half + slack;
    }
    case 'line': {
      const along = dx * fx + dz * fz;
      const side = Math.abs(-dx * fz + dz * fx);
      return along >= -targetRadius && along <= shape.length + targetRadius && side <= shape.width / 2 + targetRadius;
    }
  }
}

/** Normalizes a facing vector; falls back to south (towards the camera). */
export function normalizeFacing(fx: number, fz: number): { fx: number; fz: number } {
  const len = Math.hypot(fx, fz);
  if (!Number.isFinite(len) || len < 1e-6) return { fx: 0, fz: -1 };
  return { fx: fx / len, fz: fz / len };
}
