import { describe, expect, it } from 'vitest';
import { PALETTE_NAMES, parseGpl } from '../palette.ts';
import { LEVEL_IDS, levelCollision, levelFile } from '../levels/index.ts';
import { inSafeZone, resolveMove, type Level, type Vec3 } from '../walkmesh.ts';
import { areaAt, toLevel } from './build.ts';
import { formatLevelFile } from './format.ts';
import { parseLevelFile, type LevelError } from './validate.ts';
import { readFileSync } from 'node:fs';

/**
 * Cells reachable on foot from `from` (1 m grid, same move rules as players:
 * no jumping, steps of at most STEP_HEIGHT, obstacles block). Keyed "x,z,y".
 */
function reachable(level: Level, from: Vec3): Set<string> {
  const key = (p: Vec3): string => `${Math.round(p.x)},${Math.round(p.z)},${Math.round(p.y * 4)}`;
  const seen = new Set<string>([key(from)]);
  const queue: Vec3[] = [from];
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = resolveMove(level, p.y, p.x + dx, p.z + dz);
      if (!next) continue;
      const k = key(next);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(next);
    }
  }
  return seen;
}

const near = (cells: Set<string>, p: Vec3): boolean => {
  for (const c of cells) {
    const [x, z, y] = c.split(',').map(Number) as [number, number, number];
    if (Math.abs(x - p.x) <= 1 && Math.abs(z - p.z) <= 1 && Math.abs(y / 4 - p.y) <= 0.6) return true;
  }
  return false;
};

describe('level files', () => {
  it.each(LEVEL_IDS)('%s passes validation', (id) => {
    expect(() => levelFile(id)).not.toThrow();
  });

  it('keeps PALETTE_NAMES in the .gpl index order (LUTs rely on it)', () => {
    const gpl = readFileSync(new URL('../../../art/palette/aranya-15.gpl', import.meta.url), 'utf8');
    expect(parseGpl(gpl).map((c) => c.name)).toEqual([...PALETTE_NAMES]);
  });

  it('round-trips through the editor formatter', () => {
    const file = levelFile('zone1');
    expect(parseLevelFile(JSON.parse(formatLevelFile(file)))).toEqual(file);
  });
});

describe('zone 1 layout (GDD 8.2, Art Bible 10.5-10.13)', () => {
  const file = levelFile('zone1');
  const level = levelCollision('zone1');
  const cells = reachable(level, file.spawn);

  it('has the six areas in route order', () => {
    expect(file.areas.map((a) => a.id)).toEqual(['hub', 'shrine', 'meadow', 'stream', 'roots', 'valley']);
  });

  it.each([
    ['shrine courtyard', { x: 26, y: 2.05, z: 68 }],
    ['meadow clearing', { x: -34, y: 2, z: 40 }],
    ['stream north bank', { x: -60, y: 1, z: 160 }],
    ['root forest tier 2 east (via the root bridge)', { x: -40, y: 4.5, z: 210 }],
    ['root forest tier 3', { x: -50, y: 8, z: 220 }],
    ['valley clearing past the bridge', { x: -50, y: 8, z: 290 }],
  ])('reaches the %s on foot from the spawn (no jumping)', (_name, p) => {
    expect(near(cells, p)).toBe(true);
  });

  it('can reach every monster spawn', () => {
    for (const s of file.spawns) expect(near(cells, s), s.id).toBe(true);
  });

  it('spawns in the hub, which is a safe zone; the shrine fence is one too', () => {
    expect(areaAt(file, file.spawn)?.id).toBe('hub');
    expect(inSafeZone(level, file.spawn)).toBe(true);
    expect(inSafeZone(level, { x: 26, z: 72 })).toBe(true);
    expect(inSafeZone(level, { x: -34, z: 46 })).toBe(false);
  });
});

describe('parseLevelFile', () => {
  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(levelFile('spike'))) as Record<string, unknown>;
  const problems = (raw: unknown): string[] => {
    try {
      parseLevelFile(raw);
      return [];
    } catch (e) {
      return (e as LevelError).problems;
    }
  };

  it('reports the path of shape errors', () => {
    const raw = base();
    (raw.props as Record<string, unknown>[])[0]!.kind = 'castle';
    (raw.spawns as Record<string, unknown>[])[0]!.species = 'dragon';
    const p = problems(raw);
    expect(p.some((m) => m.startsWith('props[0].kind'))).toBe(true);
    expect(p.some((m) => m.startsWith('spawns[0].species'))).toBe(true);
  });

  it('rejects spawns off the floor, in safe zones or under bridges, and duplicate ids', () => {
    const raw = base();
    const spawns = raw.spawns as Record<string, unknown>[];
    spawns[0] = { ...spawns[0], x: 100 };
    spawns[1] = { ...spawns[1], x: 2, z: 10 }; // under the bridge (x -4..8, z 9..11, y 3)
    spawns[2] = { ...spawns[2], id: 'lostMom_2' };
    (raw.safeZones as unknown[]).push({ id: 'safe_test', x: 16, z: -18, radius: 3 });
    const p = problems(raw).join('\n');
    expect(p).toContain('lostMom_1" at (100');
    expect(p).toContain('under bridge "bridge"');
    expect(p).toContain('duplicate id "lostMom_2"');
    expect(p).toContain('"fireFowl_1" is inside a safe zone');
  });

  it('turns blocking props into collision cylinders scaled with the prop', () => {
    const file = levelFile('spike');
    const tree = toLevel(file).obstacles[0]!;
    expect(tree.radius).toBeCloseTo(0.6 * 1.34);
  });
});
