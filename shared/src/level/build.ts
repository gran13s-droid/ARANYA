import type { CylinderObstacle, Level } from '../walkmesh.ts';
import { PROP_KINDS, type LevelArea, type LevelFile } from './types.ts';

/**
 * The collision view of a level file, used identically by the server
 * (authoritative movement, monsters) and the client (prediction): walk
 * polygons, a cylinder for every blocking prop, and the safe zones.
 */
export function toLevel(file: LevelFile): Level {
  const obstacles: CylinderObstacle[] = [];
  for (const p of file.props) {
    const k = PROP_KINDS[p.kind];
    if (k.blockRadius <= 0) continue;
    const s = p.scale ?? 1;
    obstacles.push({ x: p.x, z: p.z, radius: k.blockRadius * s, yMin: p.y, yMax: p.y + k.blockHeight * s });
  }
  return { polys: file.polys, obstacles, spawn: file.spawn, safeZones: file.safeZones };
}

/** The area containing a point (first match in file order), or null outside every area. */
export function areaAt(file: LevelFile, pos: { x: number; z: number }): LevelArea | null {
  return file.areas.find((a) => pos.x >= a.bounds[0] && pos.x <= a.bounds[2] && pos.z >= a.bounds[1] && pos.z <= a.bounds[3]) ?? null;
}
