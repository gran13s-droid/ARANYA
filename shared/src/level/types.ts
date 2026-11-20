import type { MonsterId } from '../data/monsters.ts';
import type { Element } from '../data/elements.ts';
import type { PaletteName } from '../palette.ts';
import type { Vec3, WalkPoly } from '../walkmesh.ts';

/**
 * Level file format (shared/src/levels/*.json), version 1. One file is the
 * single source of truth for a zone: the server collides with it, the client
 * draws it, and the dev editor (?editor) writes it. Coordinates in meters,
 * +x east, +z north (top of the screen), y up. Validated by parseLevelFile().
 */
export const LEVEL_FILE_VERSION = 1;

/** Look of a walkable surface (client only; collision is the same for all). */
export const SURFACES = ['grass', 'dryGrass', 'dirt', 'stone', 'wood', 'bamboo', 'root', 'curse'] as const;
export type Surface = (typeof SURFACES)[number];

export interface LevelPoly extends WalkPoly {
  surface: Surface;
}

/** Ambient particles drawn by the client only (no gameplay effect). */
export const PARTICLE_KINDS = ['leaves', 'dust', 'fireflies', 'curse'] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

/** A named part of the zone (GDD 8.2, Art Bible 10.5): atmosphere and the area banner. */
export interface LevelArea {
  id: string;
  /** Axis-aligned bounds [x0, z0, x1, z1]; the first area containing the player wins. */
  bounds: [number, number, number, number];
  /** Where dev joins with `?at=<area>` start (dev server only). */
  entry?: Vec3;
  /** Monster level range shown on the banner (GDD 8.2); absent for safe areas. */
  levels?: [number, number];
  fog: { color: PaletteName; density: number };
  sun: { color: PaletteName; intensity: number };
  ambient: { color: PaletteName; ground: PaletteName; intensity: number };
  particles?: ParticleKind;
}

/**
 * Greybox prop kinds (Art Bible 10.3 modular kit). `blockRadius` > 0 adds a
 * collision cylinder of that radius from the prop's base up to `blockHeight`;
 * the client draws every kind (world/props.ts).
 */
export const PROP_KINDS = {
  tree: { blockRadius: 0.6, blockHeight: 6 },
  banyan: { blockRadius: 2.6, blockHeight: 12 },
  banyanTrunk: { blockRadius: 5.5, blockHeight: 20 },
  deadBanyan: { blockRadius: 3, blockHeight: 12 },
  takhian: { blockRadius: 0.9, blockHeight: 8 },
  palm: { blockRadius: 0.5, blockHeight: 10 },
  deadTree: { blockRadius: 0.5, blockHeight: 5 },
  bush: { blockRadius: 0, blockHeight: 0 },
  grass: { blockRadius: 0, blockHeight: 0 },
  fern: { blockRadius: 0, blockHeight: 0 },
  lotus: { blockRadius: 0, blockHeight: 0 },
  mushroom: { blockRadius: 0, blockHeight: 0 },
  rock: { blockRadius: 0.8, blockHeight: 2 },
  termiteMound: { blockRadius: 1.1, blockHeight: 3 },
  house: { blockRadius: 3, blockHeight: 6 },
  hut: { blockRadius: 2, blockHeight: 4 },
  stall: { blockRadius: 1.3, blockHeight: 3 },
  watchtower: { blockRadius: 1.6, blockHeight: 9 },
  gate: { blockRadius: 0, blockHeight: 0 },
  fence: { blockRadius: 0, blockHeight: 0 },
  noticeBoard: { blockRadius: 0.5, blockHeight: 2 },
  spiritShrine: { blockRadius: 1.2, blockHeight: 3 },
  shrine: { blockRadius: 1.4, blockHeight: 3 },
  pillar: { blockRadius: 0.35, blockHeight: 3 },
  lanternPost: { blockRadius: 0.25, blockHeight: 2.5 },
  takhan: { blockRadius: 0.25, blockHeight: 1 },
  ruinWall: { blockRadius: 0.9, blockHeight: 2 },
  waterwheel: { blockRadius: 1.5, blockHeight: 4 },
  rootArch: { blockRadius: 0, blockHeight: 0 },
  rootGate: { blockRadius: 0, blockHeight: 0 },
  curseVeil: { blockRadius: 0, blockHeight: 0 },
  warpCircle: { blockRadius: 0, blockHeight: 0 },
  lightShaft: { blockRadius: 0, blockHeight: 0 },
  // Village kit (Art Bible 10.8, concept images 22-27, 29).
  workshop: { blockRadius: 2.6, blockHeight: 5 },
  stallCloth: { blockRadius: 1.3, blockHeight: 3 },
  stallTools: { blockRadius: 1.3, blockHeight: 3 },
  lanternString: { blockRadius: 0, blockHeight: 0 },
  lotusPost: { blockRadius: 0.25, blockHeight: 1.4 },
  jar: { blockRadius: 0.45, blockHeight: 1.2 },
  khrae: { blockRadius: 0.8, blockHeight: 0.6 },
  cart: { blockRadius: 1, blockHeight: 1.5 },
  firewood: { blockRadius: 0.9, blockHeight: 1.4 },
  well: { blockRadius: 1, blockHeight: 3 },
  boat: { blockRadius: 0, blockHeight: 0 },
  clothRack: { blockRadius: 0, blockHeight: 0 },
  // Plant kit (Art Bible 10.3, concept image 28 with its brief applied).
  banana: { blockRadius: 0.3, blockHeight: 4 },
  bamboo: { blockRadius: 0.7, blockHeight: 7 },
  plumeria: { blockRadius: 0.4, blockHeight: 5 },
  cogon: { blockRadius: 0, blockHeight: 0 },
  taro: { blockRadius: 0, blockHeight: 0 },
  crystal: { blockRadius: 0.4, blockHeight: 2 },
  curseStone: { blockRadius: 0.8, blockHeight: 2 },
  curseAltar: { blockRadius: 2.2, blockHeight: 3 },
} as const satisfies Record<string, { blockRadius: number; blockHeight: number }>;
export type PropKind = keyof typeof PROP_KINDS;

export interface LevelProp {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  /** Yaw in degrees. */
  rot: number;
  scale?: number;
}

export interface LevelSpawn {
  id: string;
  species: MonsterId;
  x: number;
  y: number;
  z: number;
}

/** Training dummy (test levels). */
export interface LevelDummy {
  id: string;
  element: Element;
  x: number;
  y: number;
  z: number;
  sparring?: boolean;
  cursed?: boolean;
}

/** No fighting inside (GDD 8.2 hub, Art Bible 10.9 shrine fence): casts are refused and monsters stay out. */
export interface SafeZone {
  id: string;
  x: number;
  z: number;
  radius: number;
}

/** Dynamic point light candidate; the client lights only the nearest few (Art Bible 10.4). */
export interface LevelLight {
  id: string;
  x: number;
  y: number;
  z: number;
  color: PaletteName;
  range: number;
}

/** Water surface (not walkable: the walk polygons leave a gap under it). */
export interface LevelWater {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
}

export interface LevelFile {
  version: typeof LEVEL_FILE_VERSION;
  id: string;
  spawn: Vec3;
  areas: LevelArea[];
  polys: LevelPoly[];
  water: LevelWater[];
  props: LevelProp[];
  spawns: LevelSpawn[];
  dummies: LevelDummy[];
  safeZones: SafeZone[];
  lights: LevelLight[];
}
