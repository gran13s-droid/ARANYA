import { Color3, Mesh, StandardMaterial, VertexData, type Scene } from '@babylonjs/core';
import { areaAt, type LevelFile, type LevelPoly, type Surface } from '@aranya/shared';
import { color, type PaletteName } from '../palette.ts';

/**
 * Draws the level's walk polygons (what the server collides with) as
 * low-poly prisms, plus water. Everything of one area is merged into one
 * mesh per material, so a whole area costs at most two draw calls. Facets
 * get slightly different tones from a fixed pattern (no randomness, so every
 * client sees the same ground) to read as low-poly (Art Bible 10.2).
 */

/** Tones per surface as [base, mix, amount]; facets alternate between them. */
const SURFACE_TONES: Record<Surface, [PaletteName, PaletteName, number][]> = {
  grass: [['FOREST', 'FOREST', 0], ['FOREST', 'MOSS', 0.15], ['FOREST', 'FOREST_DEEP', 0.2]],
  dryGrass: [['MOSS', 'EARTH', 0.25], ['MOSS', 'GOLD', 0.2], ['MOSS', 'EARTH', 0.4]],
  dirt: [['EARTH', 'BARK', 0.35], ['EARTH', 'BARK', 0.5], ['EARTH', 'MOSS', 0.25]],
  stone: [['STONE', 'STONE', 0], ['STONE', 'CREAM', 0.12], ['STONE', 'INK', 0.15]],
  wood: [['BARK', 'EARTH', 0.3], ['BARK', 'EARTH', 0.45]],
  bamboo: [['GOLD', 'EARTH', 0.45], ['GOLD', 'EARTH', 0.6]],
  root: [['BARK', 'BARK', 0], ['BARK', 'EARTH', 0.2]],
  curse: [['PURPLE_DEEP', 'INK', 0.3], ['PURPLE_DEEP', 'STONE', 0.15], ['PURPLE_DEEP', 'INK', 0.5]],
};

/** Sides of solid floors reach this far down, so cliffs read as solid ground. */
const CLIFF_DEPTH = 6;
/** Thickness of non-solid floors (bridges). */
const DECK_DEPTH = 0.3;
/** Grid step used to split large floors into facets. */
const FACET_M = 4;

type P3 = [number, number, number];

const c3 = (name: PaletteName): Color3 => Color3.FromHexString(color(name).hex);

function tones(surface: Surface): Color3[] {
  return SURFACE_TONES[surface].map(([a, b, k]) => Color3.Lerp(c3(a), c3(b), k));
}

/** Top of a convex quad split into a grid of facets; other polygons use a fan. */
export function topTriangles(poly: LevelPoly): P3[][] {
  const v = poly.verts.map((p): P3 => [p.x, p.y, p.z]);
  if (v.length !== 4) return v.slice(1, -1).map((_, i) => [v[0]!, v[i + 1]!, v[i + 2]!]);
  const [a, b, c, d] = v as [P3, P3, P3, P3];
  const len = (p: P3, q: P3): number => Math.hypot(q[0] - p[0], q[2] - p[2]);
  const nu = Math.max(1, Math.round(len(a, b) / FACET_M));
  const nv = Math.max(1, Math.round(len(a, d) / FACET_M));
  const lerp = (p: P3, q: P3, k: number): P3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  const at = (u: number, w: number): P3 => lerp(lerp(a, b, u), lerp(d, c, u), w);
  const tris: P3[][] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const p00 = at(i / nu, j / nv), p10 = at((i + 1) / nu, j / nv), p11 = at((i + 1) / nu, (j + 1) / nv), p01 = at(i / nu, (j + 1) / nv);
      tris.push([p00, p10, p11], [p00, p11, p01]);
    }
  }
  return tris;
}

/** Deterministic tone per facet from its position (same on every client, no visible stripes). */
function facetTone(t: P3[], n: number): number {
  const x = Math.floor(((t[0]![0] + t[1]![0] + t[2]![0]) / 3) * 2);
  const z = Math.floor(((t[0]![2] + t[1]![2] + t[2]![2]) / 3) * 2);
  let h = Math.imul(x, 73856093) ^ Math.imul(z, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) % n;
}

interface Buffers {
  pos: number[];
  nrm: number[];
  col: number[];
}

/**
 * Adds a flat triangle. The normal is computed here and flipped to point
 * `towards` (up for tops, outwards for walls); materials render both sides,
 * so the vertex order does not matter.
 */
function tri(out: Buffers, p: P3[], c: Color3, towards: P3): void {
  const [a, b, d] = p as [P3, P3, P3];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  n = n.map((x) => x / l);
  if (n[0]! * towards[0] + n[1]! * towards[1] + n[2]! * towards[2] < 0) n = n.map((x) => -x);
  for (const q of p) {
    out.pos.push(q[0], q[1], q[2]);
    out.nrm.push(n[0]!, n[1]!, n[2]!);
    out.col.push(c.r, c.g, c.b, 1);
  }
}

/** One poly's prism: facetted top + side walls down to the cliff or deck depth. */
function appendPoly(poly: LevelPoly, out: Buffers): void {
  const palette = tones(poly.surface);
  const bottom = Math.min(...poly.verts.map((p) => p.y)) - (poly.solid ? CLIFF_DEPTH : DECK_DEPTH);
  topTriangles(poly).forEach((t) => tri(out, t, palette[facetTone(t, palette.length)]!, [0, 1, 0]));
  const side = palette[0]!.scale(0.6);
  const v = poly.verts;
  const cx = v.reduce((s, p) => s + p.x, 0) / v.length;
  const cz = v.reduce((s, p) => s + p.z, 0) / v.length;
  for (let i = 0; i < v.length; i++) {
    const p = v[i]!, q = v[(i + 1) % v.length]!;
    const out3: P3 = [(p.x + q.x) / 2 - cx, 0, (p.z + q.z) / 2 - cz];
    const pt: P3 = [p.x, p.y, p.z], qt: P3 = [q.x, q.y, q.z], pb: P3 = [p.x, bottom, p.z], qb: P3 = [q.x, bottom, q.z];
    tri(out, [pt, pb, qb], side, out3);
    tri(out, [pt, qb, qt], side, out3);
  }
}

function meshFrom(name: string, scene: Scene, b: Buffers): Mesh {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = b.pos;
  data.normals = b.nrm;
  data.colors = b.col;
  data.indices = Array.from({ length: b.pos.length / 3 }, (_, i) => i);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

export interface AreaSurfaces {
  areaId: string;
  meshes: Mesh[];
}

/** Builds floor and water meshes grouped by area (polys outside every area go to "none"). */
export function buildSurfaces(scene: Scene, file: LevelFile): AreaSurfaces[] {
  const ground = new StandardMaterial('surface_ground', scene);
  ground.diffuseColor = Color3.White();
  ground.specularColor = Color3.Black();
  ground.backFaceCulling = false;
  ground.maxSimultaneousLights = 6;
  const water = new StandardMaterial('surface_water', scene);
  water.diffuseColor = Color3.White();
  water.emissiveColor = c3('JADE_DEEP').scale(0.35);
  water.specularColor = c3('SPIRIT').scale(0.25);
  water.backFaceCulling = false;
  water.maxSimultaneousLights = 6;

  const groups = new Map<string, { floor: Buffers; water: Buffers }>();
  const group = (x: number, z: number): { floor: Buffers; water: Buffers } => {
    const id = areaAt(file, { x, z })?.id ?? 'none';
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { floor: { pos: [], nrm: [], col: [] }, water: { pos: [], nrm: [], col: [] } }));
    return g;
  };
  for (const poly of file.polys) {
    const cx = poly.verts.reduce((s, p) => s + p.x, 0) / poly.verts.length;
    const cz = poly.verts.reduce((s, p) => s + p.z, 0) / poly.verts.length;
    appendPoly(poly, group(cx, cz).floor);
  }
  const deep = c3('JADE_DEEP');
  for (const w of file.water) {
    const g = group((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
    const a: P3 = [w.x0, w.y, w.z0], b: P3 = [w.x1, w.y, w.z0], c: P3 = [w.x1, w.y, w.z1], d: P3 = [w.x0, w.y, w.z1];
    tri(g.water, [a, b, c], deep, [0, 1, 0]);
    tri(g.water, [a, c, d], deep, [0, 1, 0]);
  }

  const out: AreaSurfaces[] = [];
  for (const [areaId, g] of groups) {
    const meshes: Mesh[] = [];
    if (g.floor.pos.length) {
      const m = meshFrom(`ground_${areaId}`, scene, g.floor);
      m.material = ground;
      meshes.push(m);
    }
    if (g.water.pos.length) {
      const m = meshFrom(`water_${areaId}`, scene, g.water);
      m.material = water;
      meshes.push(m);
    }
    out.push({ areaId, meshes });
  }
  return out;
}
