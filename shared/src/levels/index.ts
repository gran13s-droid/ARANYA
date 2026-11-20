import { toLevel } from '../level/build.ts';
import type { LevelFile } from '../level/types.ts';
import { parseLevelFile } from '../level/validate.ts';
import type { Level } from '../walkmesh.ts';
import spikeJson from './spike.json' with { type: 'json' };
import zone1Json from './zone1.json' with { type: 'json' };

/**
 * Every level the game knows. `zone1` is ป่าไทรศักดิ์สิทธิ์ (GDD 8.2, Step 2.1);
 * `spike` is the tech-spike training ground used by tests and `?level=spike`.
 */
export const LEVEL_IDS = ['zone1', 'spike'] as const;
export type LevelId = (typeof LEVEL_IDS)[number];
export const DEFAULT_LEVEL: LevelId = 'zone1';

const RAW: Record<LevelId, unknown> = { zone1: zone1Json, spike: spikeJson };
const files = new Map<LevelId, { file: LevelFile; level: Level }>();

export function isLevelId(v: unknown): v is LevelId {
  return typeof v === 'string' && (LEVEL_IDS as readonly string[]).includes(v);
}

/** Validated level file (parsed once). Throws LevelError if the JSON breaks the rules. */
export function levelFile(id: LevelId): LevelFile {
  return loaded(id).file;
}

/** Collision view of a level, shared by server and client prediction. */
export function levelCollision(id: LevelId): Level {
  return loaded(id).level;
}

function loaded(id: LevelId): { file: LevelFile; level: Level } {
  let entry = files.get(id);
  if (!entry) {
    const file = parseLevelFile(RAW[id]);
    entry = { file, level: toLevel(file) };
    files.set(id, entry);
  }
  return entry;
}
