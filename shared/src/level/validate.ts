import { ELEMENTS } from '../data/elements.ts';
import { MONSTERS } from '../data/monsters.ts';
import { PALETTE_NAMES } from '../palette.ts';
import { floorAt, heightAt, inSafeZone, type Vec3 } from '../walkmesh.ts';
import { toLevel } from './build.ts';
import {
  LEVEL_FILE_VERSION,
  PARTICLE_KINDS,
  PROP_KINDS,
  SURFACES,
  type LevelArea,
  type LevelDummy,
  type LevelFile,
  type LevelLight,
  type LevelPoly,
  type LevelProp,
  type LevelSpawn,
  type LevelWater,
  type SafeZone,
} from './types.ts';

export class LevelError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`invalid level:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

/**
 * Reads untrusted JSON (a level file, or what the editor is about to save)
 * into a LevelFile. Checks the shape first, then the rules that keep the
 * client, server and Art Bible in agreement (see checkRules). Throws a
 * LevelError listing every problem.
 */
export function parseLevelFile(raw: unknown): LevelFile {
  const problems: string[] = [];
  const r = new Reader(problems);
  const file = r.level(raw);
  if (problems.length === 0 && file) problems.push(...checkRules(file));
  if (problems.length > 0 || !file) throw new LevelError(problems);
  return file;
}

/** Rules beyond the shape. Returns human-readable problems (empty when fine). */
export function checkRules(file: LevelFile): string[] {
  const out: string[] = [];
  const level = toLevel(file);
  const ids = new Map<string, string>();
  const unique = (what: string, id: string): void => {
    const prev = ids.get(id);
    if (prev) out.push(`duplicate id "${id}" (${prev} and ${what})`);
    else ids.set(id, what);
  };
  file.areas.forEach((a) => unique('area', a.id));
  file.polys.forEach((p) => unique('poly', p.id));
  file.water.forEach((w) => unique('water', w.id));
  file.props.forEach((p) => unique('prop', p.id));
  file.spawns.forEach((s) => unique('spawn', s.id));
  file.dummies.forEach((d) => unique('dummy', d.id));
  file.safeZones.forEach((s) => unique('safe zone', s.id));
  file.lights.forEach((l) => unique('light', l.id));

  for (const p of file.polys) {
    if (!isConvex(p)) out.push(`poly "${p.id}" is not convex with consistent winding`);
  }
  for (const a of file.areas) {
    const [x0, z0, x1, z1] = a.bounds;
    if (!(x0 < x1 && z0 < z1)) out.push(`area "${a.id}" bounds must be [x0, z0, x1, z1] with x0 < x1 and z0 < z1`);
  }

  const onFloor = (what: string, pos: Vec3): void => {
    const floor = floorAt(level, pos);
    if (!floor) out.push(`${what} at (${pos.x}, ${pos.y}, ${pos.z}) is not on a walkable floor`);
    else if (Math.abs(heightAt(floor, pos.x, pos.z) - pos.y) > 0.05) out.push(`${what} y=${pos.y} should be ${round(heightAt(floor, pos.x, pos.z))} (floor "${floor.id}")`);
  };
  onFloor('spawn', file.spawn);
  for (const a of file.areas) if (a.entry) onFloor(`area "${a.id}" entry`, a.entry);
  for (const s of file.spawns) {
    onFloor(`spawn "${s.id}"`, s);
    // Art Bible 10.9 / 10.12-10.13: no monsters in safe zones or under bridges.
    if (inSafeZone(level, s)) out.push(`spawn "${s.id}" is inside a safe zone`);
    const above = file.polys.find((p) => !p.solid && containsXZPoly(p, s.x, s.z) && heightAt(p, s.x, s.z) > s.y + 1);
    if (above) out.push(`spawn "${s.id}" is under bridge "${above.id}"`);
  }
  for (const d of file.dummies) onFloor(`dummy "${d.id}"`, d);
  return out;
}

const round = (n: number): number => Math.round(n * 100) / 100;

function containsXZPoly(poly: LevelPoly, x: number, z: number): boolean {
  let sign = 0;
  const v = poly.verts;
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

function isConvex(poly: LevelPoly): boolean {
  const v = poly.verts;
  if (v.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!, b = v[(i + 1) % v.length]!, c = v[(i + 2) % v.length]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** Shape checks with a path in every message, e.g. `props[3].kind`. */
class Reader {
  private readonly problems: string[];

  constructor(problems: string[]) {
    this.problems = problems;
  }

  private fail(path: string, msg: string): null {
    this.problems.push(`${path}: ${msg}`);
    return null;
  }

  private obj(v: unknown, path: string): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : this.fail(path, 'expected an object');
  }

  private num(v: unknown, path: string): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) this.fail(path, 'expected a finite number');
    return typeof v === 'number' ? v : 0;
  }

  private str(v: unknown, path: string): string {
    if (typeof v !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(v)) this.fail(path, 'expected an id (letters, digits, _ . -)');
    return typeof v === 'string' ? v : '';
  }

  private oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) this.fail(path, `expected one of ${allowed.join(', ')}`);
    return v as T;
  }

  private list<T>(v: unknown, path: string, item: (x: unknown, p: string) => T | null): T[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array');
      return [];
    }
    return v.map((x, i) => item(x, `${path}[${i}]`)).filter((x): x is T => x !== null);
  }

  private vec(v: unknown, path: string): Vec3 {
    const o = this.obj(v, path);
    return { x: this.num(o?.x, `${path}.x`), y: this.num(o?.y, `${path}.y`), z: this.num(o?.z, `${path}.z`) };
  }

  level(raw: unknown): LevelFile | null {
    const o = this.obj(raw, 'level');
    if (!o) return null;
    if (o.version !== LEVEL_FILE_VERSION) this.fail('version', `expected ${LEVEL_FILE_VERSION}`);
    const palette = PALETTE_NAMES;
    return {
      version: LEVEL_FILE_VERSION,
      id: this.str(o.id, 'id'),
      spawn: this.vec(o.spawn, 'spawn'),
      areas: this.list(o.areas, 'areas', (x, p): LevelArea | null => {
        const a = this.obj(x, p);
        if (!a) return null;
        const b = Array.isArray(a.bounds) && a.bounds.length === 4 ? a.bounds.map((n, i) => this.num(n, `${p}.bounds[${i}]`)) : (this.fail(`${p}.bounds`, 'expected [x0, z0, x1, z1]'), [0, 0, 0, 0]);
        const fog = this.obj(a.fog, `${p}.fog`);
        const sun = this.obj(a.sun, `${p}.sun`);
        const amb = this.obj(a.ambient, `${p}.ambient`);
        const area: LevelArea = {
          id: this.str(a.id, `${p}.id`),
          bounds: b as [number, number, number, number],
          fog: { color: this.oneOf(fog?.color, palette, `${p}.fog.color`), density: this.num(fog?.density, `${p}.fog.density`) },
          sun: { color: this.oneOf(sun?.color, palette, `${p}.sun.color`), intensity: this.num(sun?.intensity, `${p}.sun.intensity`) },
          ambient: {
            color: this.oneOf(amb?.color, palette, `${p}.ambient.color`),
            ground: this.oneOf(amb?.ground, palette, `${p}.ambient.ground`),
            intensity: this.num(amb?.intensity, `${p}.ambient.intensity`),
          },
        };
        if (a.levels !== undefined) {
          const l = Array.isArray(a.levels) && a.levels.length === 2 ? a.levels.map((n, i) => this.num(n, `${p}.levels[${i}]`)) : (this.fail(`${p}.levels`, 'expected [min, max]'), [0, 0]);
          area.levels = l as [number, number];
        }
        if (a.particles !== undefined) area.particles = this.oneOf(a.particles, PARTICLE_KINDS, `${p}.particles`);
        if (a.entry !== undefined) area.entry = this.vec(a.entry, `${p}.entry`);
        return area;
      }),
      polys: this.list(o.polys, 'polys', (x, p): LevelPoly | null => {
        const q = this.obj(x, p);
        if (!q) return null;
        if (typeof q.solid !== 'boolean') this.fail(`${p}.solid`, 'expected true or false');
        return {
          id: this.str(q.id, `${p}.id`),
          surface: this.oneOf(q.surface, SURFACES, `${p}.surface`),
          solid: q.solid === true,
          verts: this.list(q.verts, `${p}.verts`, (v, vp) => this.vec(v, vp)),
        };
      }),
      water: this.list(o.water, 'water', (x, p): LevelWater | null => {
        const w = this.obj(x, p);
        if (!w) return null;
        return { id: this.str(w.id, `${p}.id`), x0: this.num(w.x0, `${p}.x0`), z0: this.num(w.z0, `${p}.z0`), x1: this.num(w.x1, `${p}.x1`), z1: this.num(w.z1, `${p}.z1`), y: this.num(w.y, `${p}.y`) };
      }),
      props: this.list(o.props, 'props', (x, p): LevelProp | null => {
        const q = this.obj(x, p);
        if (!q) return null;
        const prop: LevelProp = {
          id: this.str(q.id, `${p}.id`),
          kind: this.oneOf(q.kind, Object.keys(PROP_KINDS) as (keyof typeof PROP_KINDS)[], `${p}.kind`),
          x: this.num(q.x, `${p}.x`),
          y: this.num(q.y, `${p}.y`),
          z: this.num(q.z, `${p}.z`),
          rot: this.num(q.rot, `${p}.rot`),
        };
        if (q.scale !== undefined) {
          prop.scale = this.num(q.scale, `${p}.scale`);
          if (prop.scale <= 0) this.fail(`${p}.scale`, 'must be > 0');
        }
        return prop;
      }),
      spawns: this.list(o.spawns, 'spawns', (x, p): LevelSpawn | null => {
        const q = this.obj(x, p);
        if (!q) return null;
        return {
          id: this.str(q.id, `${p}.id`),
          species: this.oneOf(q.species, Object.keys(MONSTERS) as (keyof typeof MONSTERS)[], `${p}.species`),
          x: this.num(q.x, `${p}.x`),
          y: this.num(q.y, `${p}.y`),
          z: this.num(q.z, `${p}.z`),
        };
      }),
      dummies: this.list(o.dummies, 'dummies', (x, p): LevelDummy | null => {
        const q = this.obj(x, p);
        if (!q) return null;
        const d: LevelDummy = { id: this.str(q.id, `${p}.id`), element: this.oneOf(q.element, ELEMENTS, `${p}.element`), x: this.num(q.x, `${p}.x`), y: this.num(q.y, `${p}.y`), z: this.num(q.z, `${p}.z`) };
        if (q.sparring === true) d.sparring = true;
        if (q.cursed === true) d.cursed = true;
        return d;
      }),
      safeZones: this.list(o.safeZones, 'safeZones', (x, p): SafeZone | null => {
        const q = this.obj(x, p);
        if (!q) return null;
        return { id: this.str(q.id, `${p}.id`), x: this.num(q.x, `${p}.x`), z: this.num(q.z, `${p}.z`), radius: this.num(q.radius, `${p}.radius`) };
      }),
      lights: this.list(o.lights, 'lights', (x, p): LevelLight | null => {
        const q = this.obj(x, p);
        if (!q) return null;
        return { id: this.str(q.id, `${p}.id`), x: this.num(q.x, `${p}.x`), y: this.num(q.y, `${p}.y`), z: this.num(q.z, `${p}.z`), color: this.oneOf(q.color, palette, `${p}.color`), range: this.num(q.range, `${p}.range`) };
      }),
    };
  }
}
