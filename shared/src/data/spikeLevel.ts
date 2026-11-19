import type { Level, WalkPoly } from '../walkmesh.ts';

function rect(id: string, x0: number, z0: number, x1: number, z1: number, y: number, solid: boolean): WalkPoly {
  return {
    id,
    solid,
    verts: [
      { x: x0, y, z: z0 },
      { x: x1, y, z: z0 },
      { x: x1, y, z: z1 },
      { x: x0, y, z: z1 },
    ],
  };
}

/** Solid ramp rising from y0 at z0 to y1 at z1 (towards north). */
function rampNorth(id: string, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): WalkPoly {
  return {
    id,
    solid: true,
    verts: [
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    ],
  };
}

/**
 * Tech-spike test level (meters, +x east, +z north, camera looks north).
 * Proves the multi-level rules of Art Bible 10.12: a 3 m platform reached by
 * a ramp, a bridge over a walkable path, and no falling off edges.
 * Upper levels sit north of lower ones so they never hide them from the camera.
 */
export const SPIKE_LEVEL: Level = {
  polys: [
    rect('ground', -24, -24, 24, 24, 0, true),
    rampNorth('ramp_a', -10, 0, -6, 6, 0, 3),
    rect('platform_a', -12, 6, -4, 14, 3, true),
    rect('bridge', -4, 9, 8, 11, 3, false),
    rect('platform_b', 8, 6, 14, 14, 3, true),
  ],
  obstacles: [
    { x: 6, z: -6, radius: 0.8, yMin: 0, yMax: 8 },
    { x: -14, z: -8, radius: 0.8, yMin: 0, yMax: 8 },
    { x: 14, z: -2, radius: 0.8, yMin: 0, yMax: 8 },
  ],
  spawn: { x: 0, y: 0, z: -6 },
};
