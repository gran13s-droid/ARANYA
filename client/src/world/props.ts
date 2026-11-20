import {
  Color3,
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  Sprite,
  SpriteManager,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  type Scene,
} from '@babylonjs/core';
import { CURSE_STONE_FOG_RADIUS, PPU, type LevelProp, type PropAtlasJson, type PropKind } from '@aranya/shared';
import { cameraUp } from '../camera/pixelCamera.ts';
import { color, type PaletteName } from '../palette.ts';

/**
 * Greybox props (Art Bible 10.3 modular kit) built from simple shapes in
 * palette colors, until the real low-poly models exist. Each kind is a few
 * template meshes (one per material); props are drawn as thin instances of
 * those templates per 32 m chunk, so a chunk costs one draw call per kind
 * and material however many props it holds, and far chunks are disposed
 * (zone streaming, ROADMAP 2.1).
 */

export type PartMaterial = 'lit' | 'glow' | 'shaft' | 'veil' | 'decal';

/** Chunk edge in meters. */
export const CHUNK_M = 32;
/** Chunks kept around the player's chunk (1 = 3x3 chunks, ~96 m, wider than the camera view). */
const KEEP_RADIUS = 1;

type Shape = { mesh: Mesh; mat: PartMaterial };

const c3 = (name: PaletteName): Color3 => Color3.FromHexString(color(name).hex);

/** Flat-shaded part with one palette color baked into its vertex colors. */
function tint(mesh: Mesh, name: PaletteName, mat: PartMaterial = 'lit', shade = 1): Shape {
  mesh.convertToFlatShadedMesh();
  const c = c3(name).scale(shade);
  const n = mesh.getTotalVertices();
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b, 1], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return { mesh, mat };
}

function at(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Mesh {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.scaling.set(sx, sy, sz);
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

type B = Scene;
const cyl = (s: B, h: number, dTop: number, dBot: number, tess = 6): Mesh => MeshBuilder.CreateCylinder('p', { height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: tess }, s);
const box = (s: B, w: number, h: number, d: number): Mesh => MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, s);
const ico = (s: B, r: number): Mesh => MeshBuilder.CreateIcoSphere('p', { radius: r, subdivisions: 1 }, s);
const torus = (s: B, d: number, t: number, tess = 12): Mesh => MeshBuilder.CreateTorus('p', { diameter: d, thickness: t, tessellation: tess }, s);
const disc = (s: B, r: number, tess = 16): Mesh => at(MeshBuilder.CreateDisc('p', { radius: r, tessellation: tess }, s), 0, 0, 0, Math.PI / 2);

/** Flat triangle (double-sided) with its apex up, base width `w`, height `h`, centred on its centroid, facing ±z. */
function triangle(s: B, w: number, h: number): Mesh {
  const m = MeshBuilder.CreateDisc('p', { radius: 1, tessellation: 3, sideOrientation: Mesh.DOUBLESIDE }, s);
  return at(m, 0, 0, 0, 0, 0, Math.PI / 2, h / 1.5, w / 1.732, 1);
}

/** Rotates already-placed shapes around y (e.g. to turn a roof's ridge from x to z). */
function turn(shapes: Shape[], ry: number): Shape[] {
  for (const sh of shapes) at(sh.mesh, 0, 0, 0, 0, ry);
  return shapes;
}

/**
 * Thai steep gable roof (Art Bible 10.8, concept image 24): ridge along x of
 * length `len`, eaves `span` apart at height `y`, apex `h` higher. Shingle
 * slopes, gable triangles, gold bargeboards (ปั้นลม) and tua ngao finials
 * curling out at the ridge and eave ends.
 */
function thaiRoof(s: B, len: number, span: number, h: number, y: number, roof: PaletteName = 'EARTH'): Shape[] {
  const half = span / 2;
  const pitch = Math.atan2(h, half);
  const slope = Math.hypot(half, h) + 0.3;
  const out: Shape[] = [
    tint(at(box(s, len + 0.6, 0.14, slope), 0, y + h / 2, -half / 2, -pitch), roof, 'lit', 0.85),
    tint(at(box(s, len + 0.6, 0.14, slope), 0, y + h / 2, half / 2, pitch), roof, 'lit', 0.75),
  ];
  for (const sx of [-1, 1]) {
    const x = sx * (len / 2);
    out.push(tint(at(triangle(s, span, h), x, y + h / 3, 0, 0, Math.PI / 2), roof, 'lit', 0.6));
    const bx = sx * (len / 2 + 0.32);
    out.push(tint(at(box(s, 0.12, 0.16, slope), bx, y + h / 2, -half / 2, -pitch), 'GOLD'));
    out.push(tint(at(box(s, 0.12, 0.16, slope), bx, y + h / 2, half / 2, pitch), 'GOLD'));
    // Tua ngao: hooked finials at the apex and both eave ends, tilted outward.
    out.push(tint(at(cyl(s, 0.7, 0, 0.16, 4), bx + sx * 0.12, y + h + 0.3, 0, 0, 0, -sx * 0.35), 'GOLD'));
    for (const sz of [-1, 1]) out.push(tint(at(cyl(s, 0.45, 0, 0.12, 4), bx + sx * 0.1, y + 0.15, sz * (half + 0.15), sz * 0.6, 0, -sx * 0.4), 'GOLD'));
  }
  return out;
}

/** Round woven-bamboo paper lantern (concept image 25), lit from inside. */
function paperLantern(s: B, x: number, y: number, z: number, r = 0.22): Shape[] {
  return [
    tint(at(ico(s, r), x, y, z, 0, 0, 0, 1, 1.1, 1), 'GOLD', 'glow'),
    tint(at(cyl(s, 0.08, r * 0.9, r * 0.9, 8), x, y + r * 1.05, z), 'BARK'),
    tint(at(cyl(s, 0.08, r * 0.9, r * 0.9, 8), x, y - r * 1.05, z), 'BARK'),
  ];
}

/** Cylindrical paper lantern (string lanterns, stalls). */
function tubeLantern(s: B, x: number, y: number, z: number): Shape[] {
  return [tint(at(cyl(s, 0.42, 0.26, 0.26, 8), x, y, z), 'GOLD', 'glow'), tint(at(cyl(s, 0.06, 0.3, 0.3, 8), x, y + 0.24, z), 'BARK'), tint(at(cyl(s, 0.06, 0.3, 0.3, 8), x, y - 0.24, z), 'BARK')];
}

/** Market stall frame with a shallow gable awning of `cloth` and woven lanterns on the front posts. */
function stall(s: B, cloth: PaletteName, goods: Shape[]): Shape[] {
  return [
    ...[[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]].map(([x, z]) => tint(at(box(s, 0.14, 2.3, 0.14), x!, 1.15, z!), 'BARK')),
    tint(at(box(s, 2.1, 0.9, 1.1), 0, 0.45, 0.05), 'EARTH', 'lit', 0.85),
    tint(at(box(s, 2.3, 0.1, 1.3), 0, 0.92, 0.05), 'EARTH'),
    tint(at(box(s, 2.6, 0.08, 1.05), 0, 2.4, -0.45, 0.35), cloth),
    tint(at(box(s, 2.6, 0.08, 1.05), 0, 2.4, 0.45, -0.35), cloth, 'lit', 0.85),
    ...tubeLantern(s, -1.05, 1.75, -0.78),
    ...tubeLantern(s, 1.05, 1.75, -0.78),
    ...goods,
  ];
}

/** Clay jar (โอ่ง). */
function jar(s: B, x: number, y: number, z: number, k = 1): Shape[] {
  return [tint(at(cyl(s, 0.8 * k, 0.45 * k, 0.5 * k, 8), x, y + 0.42 * k, z), 'EARTH'), tint(at(ico(s, 0.38 * k), x, y + 0.55 * k, z, 0, 0, 0, 1, 0.8, 1), 'EARTH', 'lit', 0.9), tint(at(cyl(s, 0.1, 0.36 * k, 0.36 * k, 8), x, y + 0.86 * k, z), 'BARK')];
}

/** Two-tone canopy mass: dark underside + lit top (concept image 29: darker undersides). */
function canopy(s: B, r: number, x: number, y: number, z: number, top: PaletteName = 'FOREST'): Shape[] {
  return [tint(at(ico(s, r), x, y, z, 0, 0, 0, 1.1, 0.55, 1.1), 'FOREST_DEEP'), tint(at(ico(s, r * 0.9), x, y + r * 0.25, z, 0, 0, 0, 1.05, 0.6, 1.05), top)];
}

const BUILDERS: Record<PropKind, (s: B) => Shape[]> = {
  tree: (s) => [
    tint(at(cyl(s, 2.4, 0.35, 0.6), 0, 1.2, 0), 'BARK'),
    ...canopy(s, 1.8, 0, 3.4, 0),
    tint(at(ico(s, 1.1), 0.7, 4.4, -0.4, 0, 0, 0, 1, 0.7, 1), 'MOSS', 'lit', 0.9),
  ],
  // Village banyan (concept image 29): root flares, red and cream sash, five canopy masses,
  // aerial roots and paper lanterns. The low stone platform is a walk polygon (zone1.json).
  banyan: (s) => [
    tint(at(cyl(s, 5.5, 1.8, 3.4, 8), 0, 2.75, 0), 'BARK'),
    ...[0, 1, 2, 3, 4, 5].map((i) => tint(at(box(s, 0.9, 1.2, 3.2), Math.cos(i * 1.05) * 2.2, 0.4, Math.sin(i * 1.05) * 2.2, 0, -i * 1.05 + Math.PI / 2, 0.25), 'BARK', 'lit', 0.85)),
    tint(at(torus(s, 3.1, 0.32, 12), 0, 2.7, 0), 'FIRE'),
    tint(at(torus(s, 3.2, 0.2, 12), 0, 2.35, 0), 'CREAM'),
    ...canopy(s, 4.2, 0, 8.2, 0, 'FOREST'),
    ...canopy(s, 3, -3.6, 7.2, 1.2, 'MOSS'),
    ...canopy(s, 3, 3.5, 7, -0.6, 'FOREST'),
    ...canopy(s, 2.6, 0.8, 7.4, -3.2, 'MOSS'),
    ...canopy(s, 2.6, -1, 7.8, 3.4, 'FOREST'),
    ...[[-3.2, -1.8], [2.8, -2.2], [-4, 1.5], [4.2, 1], [0.6, -3.6], [-1.6, 3.4]].map(([x, z]) => tint(at(cyl(s, 3.6, 0.07, 0.12, 4), x!, 4.9, z!), 'BARK', 'lit', 0.9)),
    ...[[-3.6, -2.4], [3.4, -2.6], [-4.4, 1.6], [4.6, 1.2]].flatMap(([x, z]) => paperLantern(s, x!, 4.9, z!)),
  ],
  banyanTrunk: (s) => [
    tint(at(cyl(s, 16, 7, 11, 9), 0, 8, 0), 'BARK'),
    ...[0, 1, 2, 3, 4, 5].map((i) => tint(at(box(s, 1.4, 2.2, 7), Math.cos(i) * 6, 0.8, Math.sin(i) * 6, 0, -i, 0), 'BARK', 'lit', 0.8)),
  ],
  deadBanyan: (s) => [
    tint(at(cyl(s, 7, 1.2, 2.8, 7), 0, 3.5, 0), 'BARK', 'lit', 0.75),
    ...[0, 1, 2, 3].map((i) => tint(at(cyl(s, 4, 0.15, 0.5, 5), Math.cos(i * 1.6) * 1.6, 7.5, Math.sin(i * 1.6) * 1.6, Math.sin(i * 1.6) * 0.8, 0, -Math.cos(i * 1.6) * 0.8), 'STONE', 'lit', 0.8)),
  ],
  takhian: (s) => [
    tint(at(cyl(s, 5, 0.6, 1), 0, 2.5, 0), 'BARK'),
    ...canopy(s, 2.4, 0, 6, 0, 'FOREST'),
    tint(at(torus(s, 1.1, 0.12), 0, 1.2, 0), 'FIRE'),
    tint(at(torus(s, 1.05, 0.12), 0, 1.45, 0), 'GOLD'),
    tint(at(torus(s, 1.0, 0.12), 0, 1.7, 0), 'JADE'),
  ],
  // Sugar palm (ต้นตาล, Art Bible 10.10), not a coconut: straight trunk, a ball of stiff round fan leaves.
  palm: (s) => [
    tint(at(cyl(s, 8.5, 0.35, 0.5, 6), 0, 4.25, 0), 'EARTH', 'lit', 0.8),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
      const a = i * 0.7;
      const up = i % 3 === 0 ? -0.2 : 0.5;
      return tint(at(cyl(s, 0.06, 1.7, 1.7, 7), Math.cos(a) * 0.9, 8.8 + up * 0.6, Math.sin(a) * 0.9, Math.sin(a) * (0.9 - up), 0, -Math.cos(a) * (0.9 - up)), i % 4 === 0 ? 'EARTH' : 'MOSS', 'lit', i % 2 ? 1 : 0.85);
    }),
  ],
  deadTree: (s) => [
    tint(at(cyl(s, 3.5, 0.15, 0.35, 5), 0, 1.75, 0), 'BARK', 'lit', 0.8),
    tint(at(cyl(s, 1.6, 0.05, 0.15, 4), 0.5, 3.2, 0, 0, 0, -0.8), 'STONE', 'lit', 0.8),
    tint(at(cyl(s, 1.4, 0.05, 0.12, 4), -0.4, 2.6, 0.2, 0.3, 0, 0.9), 'STONE', 'lit', 0.8),
  ],
  bush: (s) => [tint(at(ico(s, 0.7), 0, 0.4, 0, 0, 0, 0, 1, 0.7, 1), 'FOREST', 'lit', 1.05)],
  grass: (s) => [0, 2.1, 4.2].map((a) => tint(at(cyl(s, 0.6, 0, 0.12, 3), Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), 'MOSS', 'lit', 1.1)),
  fern: (s) => [0, 1.6, 3.2, 4.7].map((a) => tint(at(box(s, 0.25, 0.04, 1), Math.cos(a) * 0.4, 0.25, Math.sin(a) * 0.4, 0.4, Math.PI / 2 - a, 0), 'FOREST')),
  // White lotus with gold petal tips (Art Bible 10.6), never pink.
  lotus: (s) => [tint(at(cyl(s, 0.04, 0.9, 0.9, 8), 0, 0.02, 0), 'FOREST'), tint(at(cyl(s, 0.32, 0.05, 0.34, 6), 0.15, 0.2, 0), 'CREAM'), tint(at(cyl(s, 0.12, 0, 0.16, 6), 0.15, 0.42, 0), 'GOLD')],
  // Glowing SPIRIT mushrooms of the root forest (Art Bible 10.12), not red fairy-tale caps.
  mushroom: (s) => [tint(at(cyl(s, 0.3, 0.06, 0.08, 5), 0, 0.15, 0), 'CREAM'), tint(at(cyl(s, 0.12, 0.05, 0.36, 6), 0, 0.34, 0), 'SPIRIT', 'glow')],
  rock: (s) => [tint(at(ico(s, 0.8), 0, 0.3, 0, 0, 0, 0, 1, 0.6, 0.9), 'STONE'), tint(at(ico(s, 0.45), 0.35, 0.55, -0.2, 0, 0, 0, 1, 0.35, 1), 'MOSS', 'lit', 0.8)],
  termiteMound: (s) => [tint(at(cyl(s, 2.6, 0.3, 2.2, 7), 0, 1.3, 0), 'EARTH')],
  // Stilt house (concept image 24): front terrace + ladder facing south, khrae and jar under the floor.
  house: (s) => [
    ...[-2.2, 0, 2.2].flatMap((x) => [-1.6, 1.6].map((z) => tint(at(box(s, 0.24, 1.9, 0.24), x, 0.95, z), 'BARK'))),
    tint(at(box(s, 5.2, 0.25, 4.2), 0, 1.95, 0), 'EARTH', 'lit', 0.8),
    tint(at(box(s, 4.4, 1.9, 2.8), 0, 3.05, 0.55), 'EARTH'),
    tint(at(box(s, 1, 1.4, 0.1), 0, 2.85, -0.9), 'INK'),
    tint(at(box(s, 0.5, 0.9, 0.08), -1.4, 3.1, -0.88), 'JADE_DEEP'),
    tint(at(box(s, 0.5, 0.9, 0.08), 1.4, 3.1, -0.88), 'JADE_DEEP'),
    tint(at(box(s, 5, 0.1, 0.1), 0, 2.55, -2.05), 'GOLD', 'lit', 0.85),
    ...[-2.4, 2.4].map((x) => tint(at(box(s, 0.1, 0.6, 0.1), x, 2.35, -2.05), 'BARK')),
    tint(at(box(s, 0.8, 0.12, 2.4), 1.6, 1, -2.7, -0.75), 'BARK'),
    ...turn(thaiRoof(s, 4.4, 5, 2.4, 3.95), Math.PI / 2),
    tint(at(box(s, 1.6, 0.3, 0.9), -1, 0.4, 0.2), 'GOLD', 'lit', 0.85),
    ...jar(s, 1.2, 0, 0.6, 0.8),
    ...paperLantern(s, -2.5, 3.6, -2.2, 0.18),
    ...paperLantern(s, 2.5, 3.6, -2.2, 0.18),
  ],
  hut: (s) => [
    ...[[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]].map(([x, z]) => tint(at(box(s, 0.18, 1, 0.18), x!, 0.5, z!), 'BARK')),
    tint(at(box(s, 3.2, 1.4, 2.4), 0, 1.7, 0), 'EARTH'),
    ...turn(thaiRoof(s, 2.6, 3.4, 1.5, 2.4, 'GOLD'), Math.PI / 2),
  ],
  // Amulet maker's workshop (concept image 24): open front with a workbench, jars and a cream awning.
  workshop: (s) => [
    ...[-1.8, 1.8].flatMap((x) => [-1.3, 1.3].map((z) => tint(at(box(s, 0.22, 1.5, 0.22), x, 0.75, z), 'BARK'))),
    tint(at(box(s, 4.2, 0.25, 3.4), 0, 1.55, 0), 'EARTH', 'lit', 0.8),
    tint(at(box(s, 3.8, 1.8, 0.2), 0, 2.6, 1.5), 'EARTH'),
    tint(at(box(s, 0.2, 1.8, 3), -1.9, 2.6, 0), 'EARTH', 'lit', 0.9),
    tint(at(box(s, 2.2, 0.15, 0.9), 0.4, 2.25, 0.6), 'BARK'),
    ...jar(s, -1.2, 1.65, 0.8, 0.5),
    ...jar(s, -0.6, 1.65, 0.9, 0.4),
    tint(at(box(s, 4.4, 0.08, 1.4), 0, 3.15, -2.2, 0.3), 'CREAM'),
    ...turn(thaiRoof(s, 3.6, 4.2, 2, 3.5), Math.PI / 2),
    tint(at(box(s, 0.7, 0.12, 2), 1.5, 0.8, -2.1, -0.7), 'BARK'),
  ],
  stall: (s) => stall(s, 'JADE_DEEP', [...jar(s, -0.55, 0.97, 0.1, 0.45), ...jar(s, 0.1, 0.97, 0.25, 0.5), tint(at(ico(s, 0.3), 0.65, 1.2, 0.1, 0, 0, 0, 1, 0.8, 1), 'MOSS')]),
  stallCloth: (s) => stall(s, 'FIRE', [
    tint(at(box(s, 0.6, 0.2, 0.5), -0.55, 1.07, 0.1), 'FIRE', 'lit', 0.85),
    tint(at(box(s, 0.6, 0.2, 0.5), 0.1, 1.07, 0.1), 'GOLD'),
    tint(at(box(s, 0.6, 0.2, 0.5), 0.7, 1.07, 0.1), 'JADE_DEEP'),
    tint(at(box(s, 0.6, 0.18, 0.5), -0.55, 1.26, 0.1), 'CREAM'),
    tint(at(cyl(s, 0.5, 0.45, 0.4, 8), 0.4, 1.22, 0.45), 'GOLD', 'lit', 0.8),
  ]),
  stallTools: (s) => stall(s, 'CREAM', [
    tint(at(ico(s, 0.25), 0.5, 1.15, 0.2, 0, 0, 0, 1, 0.8, 1), 'INK'),
    tint(at(box(s, 0.7, 0.12, 0.4), -0.4, 1.03, 0.1), 'STONE'),
    ...[-0.6, -0.2, 0.2, 0.6].map((x) => tint(at(box(s, 0.08, 0.45, 0.08), x, 1.9, 0.6), 'STONE')),
  ]),
  // Watchtower (concept image 27): braced legs, railed platform, ladder and a Thai gable roof (no spire).
  watchtower: (s) => [
    ...[[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].flatMap(([x, z]) => [tint(at(box(s, 0.3, 6.2, 0.3), x!, 3.1, z!), 'BARK'), tint(at(box(s, 0.5, 0.3, 0.5), x!, 0.15, z!), 'STONE')]),
    ...[-1.1, 1.1].flatMap((z) => [tint(at(box(s, 0.12, 3.2, 0.12), 0, 2.2, z, 0, 0, 0.6), 'BARK', 'lit', 0.85), tint(at(box(s, 0.12, 3.2, 0.12), 0, 2.2, z, 0, 0, -0.6), 'BARK', 'lit', 0.85)]),
    tint(at(box(s, 3.1, 0.25, 3.1), 0, 6.2, 0), 'EARTH'),
    ...[-1.45, 1.45].flatMap((v) => [tint(at(box(s, 3, 0.1, 0.1), 0, 6.8, v), 'GOLD', 'lit', 0.85), tint(at(box(s, 0.1, 0.1, 3), v, 6.8, 0), 'GOLD', 'lit', 0.85)]),
    ...[[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].map(([x, z]) => tint(at(box(s, 0.14, 1.6, 0.14), x!, 7.1, z!), 'BARK')),
    ...turn(thaiRoof(s, 3.2, 3.4, 1.8, 7.9), Math.PI / 2),
    tint(at(box(s, 0.6, 0.1, 6.6), 1.6, 3.1, -1.6, -1.1), 'BARK', 'lit', 0.9),
  ],
  // Village gate (concept image 24): two posts on stone, a carved lintel, a gable roof and lanterns.
  gate: (s) => [
    ...[-3.4, 3.4].flatMap((x) => [tint(at(box(s, 0.5, 4.2, 0.5), x, 2.1, 0), 'BARK'), tint(at(box(s, 0.8, 0.5, 0.8), x, 0.25, 0), 'STONE')]),
    tint(at(box(s, 7.8, 0.5, 0.5), 0, 3.9, 0), 'BARK', 'lit', 0.9),
    tint(at(box(s, 5, 0.22, 0.1), 0, 3.9, -0.27), 'GOLD'),
    ...thaiRoof(s, 7.6, 1.6, 1.1, 4.15),
    ...paperLantern(s, -3.4, 3.1, -0.45, 0.2),
    ...paperLantern(s, 3.4, 3.1, -0.45, 0.2),
  ],
  // Bamboo fence (concept image 23): wooden posts, bamboo rails, rope lashing.
  fence: (s) => [
    ...[-2, 0, 2].map((x) => tint(at(box(s, 0.16, 1.2, 0.16), x, 0.6, 0), 'BARK')),
    ...[0.45, 0.85].map((y) => tint(at(box(s, 4, 0.1, 0.1), 0, y, 0), 'GOLD', 'lit', 0.85)),
    ...[-2, 0, 2].map((x) => tint(at(box(s, 0.22, 0.08, 0.22), x, 0.85, 0), 'CREAM', 'lit', 0.8)),
  ],
  noticeBoard: (s) => [
    ...[-0.75, 0.75].flatMap((x) => [tint(at(box(s, 0.16, 2.2, 0.16), x, 1.1, 0), 'BARK'), tint(at(box(s, 0.32, 0.25, 0.32), x, 0.12, 0), 'STONE')]),
    tint(at(box(s, 1.5, 1, 0.1), 0, 1.45, 0), 'EARTH'),
    ...[[-0.4, 1.6], [0.3, 1.55], [-0.1, 1.2]].map(([x, y]) => tint(at(box(s, 0.38, 0.32, 0.04), x!, y!, -0.07), 'CREAM')),
    ...thaiRoof(s, 1.6, 0.7, 0.45, 2.2),
  ],
  // Spirit house at the banyan (concept image 23): stone pedestal, gold roof, garland, elephant and horse.
  spiritShrine: (s) => [
    tint(at(box(s, 1.1, 0.9, 1.1), 0, 0.45, 0), 'STONE'),
    tint(at(box(s, 0.8, 0.75, 0.7), 0, 1.3, 0), 'CREAM'),
    tint(at(box(s, 0.34, 0.45, 0.04), 0, 1.25, -0.37), 'GOLD', 'glow'),
    ...turn(thaiRoof(s, 0.8, 1, 0.7, 1.7, 'GOLD'), Math.PI / 2),
    tint(at(torus(s, 1.2, 0.07, 10), 0, 0.92, 0), 'GOLD'),
    tint(at(box(s, 0.22, 0.18, 0.3), -0.38, 1.0, -0.4), 'CREAM'),
    tint(at(box(s, 0.12, 0.22, 0.26), 0.38, 1.02, -0.4), 'EARTH'),
  ],
  shrine: (s) => [
    tint(at(box(s, 2.6, 1.4, 2.2), 0, 0.7, 0), 'STONE'),
    tint(at(box(s, 1, 0.7, 1.2), 0, 0.35, -1.6), 'STONE', 'lit', 0.85),
    ...[[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]].map(([x, z]) => tint(at(cyl(s, 1.3, 0.12, 0.12), x!, 2.05, z!), 'CREAM')),
    ...turn(thaiRoof(s, 2, 2.4, 1.3, 2.7, 'GOLD'), Math.PI / 2),
    tint(at(box(s, 0.5, 0.3, 0.3), 0, 1.55, 0), 'GOLD', 'glow'),
  ],
  pillar: (s) => [tint(at(cyl(s, 2.6, 0.4, 0.5), 0, 1.3, 0), 'STONE'), tint(at(ico(s, 0.3), 0, 2.85, 0, 0, 0, 0, 1, 1.4, 1), 'CREAM')],
  // Lantern post (concept image 25): stone footing, post with an arm, round paper lantern.
  lanternPost: (s) => [
    tint(at(box(s, 0.5, 0.45, 0.5), 0, 0.22, 0), 'STONE'),
    tint(at(box(s, 0.2, 2.6, 0.2), 0, 1.5, 0), 'BARK'),
    tint(at(box(s, 0.9, 0.14, 0.14), 0.4, 2.65, 0), 'BARK'),
    ...[1.2, 2.3].map((y) => tint(at(torus(s, 0.3, 0.06, 6), 0, y, 0), 'CREAM', 'lit', 0.8)),
    ...paperLantern(s, 0.75, 2.15, 0),
  ],
  lanternString: (s) => [
    ...[-2.2, 2.2].flatMap((x) => [tint(at(box(s, 0.45, 0.45, 0.45), x, 0.22, 0), 'STONE'), tint(at(box(s, 0.2, 2.8, 0.2), x, 1.6, 0), 'BARK')]),
    tint(at(cyl(s, 4.4, 0.05, 0.05, 4), 0, 2.75, 0, 0, 0, Math.PI / 2), 'EARTH'),
    ...[-1.3, -0.45, 0.45, 1.3].flatMap((x) => tubeLantern(s, x, 2.3, 0)),
  ],
  takhan: (s) => [tint(at(cyl(s, 0.3, 0.32, 0.22, 6), 0, 0.15, 0), 'EARTH'), tint(at(cyl(s, 0.3, 0, 0.16, 5), 0, 0.45, 0), 'GOLD', 'glow')],
  // Stone post with a gold lotus bud, around the banyan platform (concept image 29).
  lotusPost: (s) => [tint(at(box(s, 0.4, 0.8, 0.4), 0, 0.4, 0), 'STONE'), tint(at(ico(s, 0.2), 0, 0.98, 0, 0, 0, 0, 1, 1.5, 1), 'GOLD')],
  jar: (s) => jar(s, 0, 0, 0, 1),
  khrae: (s) => [
    tint(at(box(s, 2, 0.12, 1.1), 0, 0.5, 0), 'GOLD', 'lit', 0.9),
    ...[[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]].map(([x, z]) => tint(at(box(s, 0.12, 0.5, 0.12), x!, 0.25, z!), 'BARK')),
  ],
  cart: (s) => [
    tint(at(box(s, 1.6, 0.12, 1.1), 0, 0.75, 0), 'BARK'),
    ...[-0.55, 0.55].map((z) => tint(at(box(s, 1.6, 0.35, 0.08), 0, 0.98, z), 'BARK', 'lit', 0.9)),
    tint(at(torus(s, 1, 0.1, 10), 0.2, 0.5, 0.62, Math.PI / 2), 'EARTH'),
    ...[-0.35, 0.35].map((z) => tint(at(box(s, 1.6, 0.08, 0.08), -1.5, 0.72, z), 'BARK')),
    ...jar(s, 0.3, 0.8, 0, 0.5),
  ],
  firewood: (s) => [
    ...[-0.8, 0.8].map((x) => tint(at(box(s, 0.12, 1.4, 0.12), x, 0.7, 0), 'BARK')),
    ...[0.2, 0.5, 0.8, 1.1].flatMap((y, i) => [-0.4, 0, 0.4].map((x) => tint(at(cyl(s, 0.9, 0.28, 0.28, 6), x + (i % 2) * 0.2 - 0.1, y, 0, Math.PI / 2), 'EARTH', 'lit', 0.85 + (i % 2) * 0.1))),
  ],
  well: (s) => [
    tint(at(torus(s, 1.4, 0.35, 10), 0, 0.35, 0, 0, 0, 0, 1, 1.6, 1), 'STONE'),
    tint(at(cyl(s, 0.05, 1.2, 1.2, 10), 0, 0.3, 0), 'JADE_DEEP'),
    ...[-0.9, 0.9].map((x) => tint(at(box(s, 0.16, 2.2, 0.16), x, 1.1, 0), 'BARK')),
    ...thaiRoof(s, 2, 1.4, 0.8, 2.2),
    tint(at(cyl(s, 0.3, 0.26, 0.2, 6), 0, 1.4, 0), 'EARTH'),
  ],
  // Vendor boat (ruea mae kha) with baskets of fruit, floating on the water.
  boat: (s) => [
    tint(at(box(s, 4, 0.4, 1), 0, 0.2, 0), 'BARK'),
    ...[-1, 1].map((sx) => tint(at(cyl(s, 1, 0, 0.9, 4), sx * 2.3, 0.3, 0, 0, Math.PI / 4, -sx * Math.PI / 2 + sx * 0.25), 'BARK', 'lit', 0.9)),
    ...[[-1.1, 'GOLD'], [-0.2, 'FIRE'], [0.7, 'MOSS']].flatMap(([x, c]) => [tint(at(cyl(s, 0.3, 0.55, 0.45, 8), x as number, 0.5, 0), 'GOLD', 'lit', 0.8), tint(at(ico(s, 0.22), x as number, 0.72, 0), c as PaletteName)]),
  ],
  clothRack: (s) => [
    ...[-1, 1].map((x) => tint(at(box(s, 0.1, 1.8, 0.1), x, 0.9, 0), 'GOLD', 'lit', 0.8)),
    tint(at(cyl(s, 2.1, 0.07, 0.07, 6), 0, 1.75, 0, 0, 0, Math.PI / 2), 'GOLD', 'lit', 0.9),
    tint(at(box(s, 0.7, 1, 0.04), -0.45, 1.25, 0), 'FIRE'),
    tint(at(box(s, 0.7, 1, 0.04), 0.45, 1.25, 0), 'JADE_DEEP'),
  ],
  // Plant kit (concept image 28, Art Bible 10.3).
  banana: (s) => [
    tint(at(cyl(s, 2.2, 0.22, 0.32, 6), 0, 1.1, 0), 'MOSS', 'lit', 0.75),
    ...[0, 1, 2, 3, 4, 5].map((i) => tint(at(box(s, 0.55, 0.04, 2), Math.cos(i * 1.05) * 0.8, 2.6, Math.sin(i * 1.05) * 0.8, -0.5, Math.PI / 2 - i * 1.05, 0), 'MOSS', 'lit', i % 2 ? 1 : 0.85)),
    tint(at(cyl(s, 0.6, 0.15, 0.3, 6), 0.25, 1.9, -0.2), 'GOLD'),
  ],
  bamboo: (s) => [
    ...[[0, 0], [0.5, 0.3], [-0.4, 0.4], [0.2, -0.5], [-0.5, -0.3], [0.6, -0.2]].map(([x, z], i) => tint(at(cyl(s, 6 + (i % 3), 0.14, 0.18, 6), x!, (6 + (i % 3)) / 2, z!, z! * 0.08, 0, -x! * 0.08), 'MOSS', 'lit', i % 2 ? 0.95 : 0.8)),
    ...[[0.3, 6.4, 0.2], [-0.4, 5.6, 0.1], [0.2, 7, -0.4]].map(([x, y, z]) => tint(at(ico(s, 0.9), x!, y!, z!, 0, 0, 0, 1, 0.6, 1), 'FOREST')),
  ],
  plumeria: (s) => [
    tint(at(cyl(s, 2, 0.25, 0.35, 6), 0, 1, 0), 'EARTH', 'lit', 0.8),
    ...[-0.6, 0.6].map((x) => tint(at(cyl(s, 1.4, 0.12, 0.18, 5), x * 0.5, 2.4, 0, 0, 0, -x * 0.9), 'EARTH', 'lit', 0.8)),
    ...canopy(s, 1.5, 0, 3.4, 0, 'FOREST'),
    ...[[-0.8, 3.9, -0.6], [0.7, 4, -0.5], [0.1, 4.3, -0.9], [0.9, 3.6, 0.6], [-0.6, 3.7, 0.8]].map(([x, y, z]) => tint(at(ico(s, 0.18), x!, y!, z!), 'CREAM')),
  ],
  // Cogon grass (หญ้าคา) of the meadow: dry blades with cream plumes (Art Bible 10.10).
  cogon: (s) => [0, 1.3, 2.6, 3.9, 5.2].flatMap((a, i) => [
    tint(at(cyl(s, 0.9, 0, 0.1, 3), Math.cos(a) * 0.15, 0.45, Math.sin(a) * 0.15, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25), i % 2 ? 'MOSS' : 'GOLD', 'lit', 0.9),
    ...(i % 2 ? [] : [tint(at(cyl(s, 0.35, 0, 0.12, 4), Math.cos(a) * 0.3, 1.05, Math.sin(a) * 0.3), 'CREAM')]),
  ]),
  taro: (s) => [0, 1.6, 3.2, 4.8].flatMap((a) => [
    tint(at(cyl(s, 0.9, 0.05, 0.05, 4), Math.cos(a) * 0.2, 0.45, Math.sin(a) * 0.2, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3), 'MOSS'),
    tint(at(cyl(s, 0.04, 0.9, 0.9, 7), Math.cos(a) * 0.45, 0.95, Math.sin(a) * 0.45, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5), 'FOREST', 'lit', 1.05),
  ]),
  ruinWall: (s) => [tint(at(box(s, 1.8, 1.8, 0.7), -0.6, 0.9, 0), 'STONE'), tint(at(box(s, 1.2, 1, 0.7), 0.9, 0.5, 0, 0, 0, 0.15), 'STONE', 'lit', 0.85)],
  waterwheel: (s) => [
    tint(at(torus(s, 3.2, 0.2, 16), 0, 1.8, 0, Math.PI / 2), 'BARK'),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => tint(at(cyl(s, 0.5, 0.18, 0.18, 5), Math.cos(i * 0.785) * 1.6, 1.8 + Math.sin(i * 0.785) * 1.6, 0, Math.PI / 2), 'GOLD', 'lit', 0.85)),
    tint(at(cyl(s, 1, 0.2, 0.2), 0, 1.8, 0, Math.PI / 2), 'BARK'),
  ],
  rootArch: (s) => [tint(at(torus(s, 4.4, 0.7, 10), 0, 0.2, 0, Math.PI / 2, 0, 0, 1, 1, 0.8), 'BARK', 'lit', 0.9)],
  rootGate: (s) => [
    tint(at(torus(s, 5.6, 1.1, 12), 0, 0.8, 0, Math.PI / 2), 'BARK'),
    tint(at(MeshBuilder.CreatePlane('p', { width: 4, height: 3.4 }, s), 0, 1.6, 0.2), 'CURSE', 'veil'),
  ],
  curseVeil: (s) => [tint(at(MeshBuilder.CreatePlane('p', { width: 8, height: 5 }, s), 0, 2.5, 0), 'CURSE', 'veil')],
  warpCircle: (s) => [tint(at(torus(s, 2.6, 0.14, 24), 0, 0.06, 0), 'SPIRIT', 'glow'), tint(at(disc(s, 1.2), 0, 0.04, 0), 'JADE', 'decal')],
  lightShaft: (s) => [tint(at(cyl(s, 10, 1.4, 3, 8), 0, 5, 0), 'CREAM', 'shaft')],
  crystal: (s) => [tint(at(cyl(s, 1.6, 0, 0.5, 4), 0, 0.8, 0, 0.15), 'PURPLE_DEEP'), tint(at(cyl(s, 0.5, 0, 0.28, 4), 0.1, 1.6, 0, 0.15), 'CURSE')],
  curseStone: (s) => [
    tint(at(ico(s, 0.9), 0, 0.4, 0, 0, 0, 0, 1, 0.7, 1), 'STONE'),
    tint(at(cyl(s, 1.4, 0, 0.45, 4), 0, 1.2, 0), 'CURSE', 'glow'),
    // Fog drawn at the same radius the server will use (Art Bible 10.13).
    tint(at(disc(s, CURSE_STONE_FOG_RADIUS, 24), 0, 0.05, 0), 'PURPLE_DEEP', 'decal'),
  ],
  curseAltar: (s) => [
    tint(at(box(s, 4.4, 0.6, 4.4), 0, 0.3, 0), 'STONE', 'lit', 0.8),
    tint(at(box(s, 3, 0.6, 3), 0, 0.9, 0), 'STONE'),
    tint(at(cyl(s, 2.4, 0, 0.8, 4), 0, 2.4, 0), 'CURSE', 'glow'),
    tint(at(cyl(s, 1.4, 0, 0.5, 4), 0.9, 1.9, 0.4, 0.3), 'PURPLE_DEEP'),
  ],
};

/**
 * Unlit, full-brightness vertex colors. With lighting disabled, StandardMaterial
 * multiplies the vertex color by (emissive + ambient), so emissive must be white
 * or glowing parts (lanterns, veils, decals) come out black.
 */
function unlit(m: StandardMaterial): void {
  m.disableLighting = true;
  m.emissiveColor = Color3.White();
}

interface Template {
  parts: Mesh[];
}

interface Billboard {
  sprite: Sprite;
  /** Where the picture stands on the ground, and its size in metres. */
  x: number;
  z: number;
  w: number;
  h: number;
}

interface Chunk {
  meshes: Mesh[];
  sprites: Billboard[];
}

/** Alpha of a billboard standing between the camera and the player (Art Bible 10.4: occluders fade). */
const OCCLUDER_ALPHA = 0.35;
const OPAQUE = new Color4(1, 1, 1, 1);
const FADED = new Color4(1, 1, 1, OCCLUDER_ALPHA);

/** Most prop billboards alive at once (3x3 chunks plus the hysteresis ring). */
const BILLBOARD_CAPACITY = 4096;
/** Natural props are mirrored at random (by id) so repeated pictures look less alike. */
const MIRRORABLE: ReadonlySet<PropKind> = new Set(['tree', 'banana', 'bamboo', 'plumeria', 'bush', 'grass', 'cogon', 'fern', 'rock', 'taro', 'jar']);

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function disposeChunk(chunk: Chunk): void {
  for (const m of chunk.meshes) m.dispose();
  for (const b of chunk.sprites) b.sprite.dispose();
}

const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;
/** Chunk grid offset by half a chunk so the hub plaza (around 0,0) sits inside one chunk instead of on a corner of four. */
const chunkOf = (x: number, z: number): [number, number] => [Math.floor((x + CHUNK_M / 2) / CHUNK_M), Math.floor((z + CHUNK_M / 2) / CHUNK_M)];

/**
 * Streams props by chunk around the player. The editor changes `props` in
 * place and calls rebuild() for the chunks it touched.
 */
export class PropChunks {
  private readonly templates = new Map<PropKind, Template>();
  private readonly materials: Record<PartMaterial, StandardMaterial>;
  private readonly byChunk = new Map<string, LevelProp[]>();
  private readonly loaded = new Map<string, Chunk>();
  private center: [number, number] | null = null;
  /** Prototype billboards cut from the concept sheets (import-props); kinds without a frame stay 3D. */
  private billboards: { manager: SpriteManager; atlas: PropAtlasJson } | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly props: LevelProp[],
  ) {
    const mat = (name: string, setup: (m: StandardMaterial) => void): StandardMaterial => {
      const m = new StandardMaterial(`props_${name}`, scene);
      m.diffuseColor = Color3.White();
      m.specularColor = Color3.Black();
      m.maxSimultaneousLights = 6;
      setup(m);
      return m;
    };
    this.materials = {
      lit: mat('lit', () => {}),
      glow: mat('glow', (m) => unlit(m)),
      shaft: mat('shaft', (m) => {
        unlit(m);
        m.alpha = 0.1;
        m.alphaMode = 1; // ALPHA_ADD
        m.backFaceCulling = false;
      }),
      veil: mat('veil', (m) => {
        unlit(m);
        m.alpha = 0.5;
        m.backFaceCulling = false;
      }),
      decal: mat('decal', (m) => {
        unlit(m);
        m.alpha = 0.35;
        m.zOffset = -2;
      }),
    };
    this.reindex();
  }

  /**
   * Draws the kinds found in `atlas` as camera-facing pictures standing on
   * their bottom-centre pixel (like characters) instead of greybox meshes.
   * One sprite manager for every chunk: all billboards cost one draw call.
   * Collision is unchanged (it comes from the level file).
   */
  useBillboards(atlas: PropAtlasJson, imageUrl: string): void {
    const manager = new SpriteManager('propBillboards', imageUrl, BILLBOARD_CAPACITY, { width: 32, height: 32 }, this.scene, 0.01, Texture.NEAREST_SAMPLINGMODE, true, JSON.stringify({ frames: atlas.frames }));
    manager.pixelPerfect = true;
    manager.fogEnabled = true;
    manager.isPickable = false;
    this.billboards = { manager, atlas };
    this.rebuild();
  }

  /**
   * Fades billboards that stand between the camera and the player (Art Bible
   * 10.4). The camera looks north and down 35 degrees, so a picture south of
   * the player covers them when it is wide enough and tall enough to reach the
   * player's height on screen (a picture of height h reaches about h * 0.82 /
   * tan 35 = 1.17 h metres further north).
   */
  fadeOccluders(player: { x: number; z: number }): void {
    for (const chunk of this.loaded.values()) {
      for (const b of chunk.sprites) {
        const dz = player.z - b.z;
        const covers = dz > 0.2 && dz < b.h * 1.17 && Math.abs(player.x - b.x) < b.w / 2 + 0.3;
        const want = covers ? FADED : OPAQUE;
        if (b.sprite.color.a !== want.a) b.sprite.color = want.clone();
      }
    }
  }

  /** Billboards alive (dev probe). */
  get billboardCount(): number {
    return this.billboards?.manager.sprites.length ?? 0;
  }

  /** Chunks currently built (for the dev probe). */
  get loadedCount(): number {
    return this.loaded.size;
  }

  /** Builds chunks around `pos` and disposes far ones; cheap when the player stays in the same chunk. */
  update(pos: { x: number; z: number }): void {
    const [cx, cz] = chunkOf(pos.x, pos.z);
    if (this.center && this.center[0] === cx && this.center[1] === cz) return;
    this.center = [cx, cz];
    for (let dz = -KEEP_RADIUS; dz <= KEEP_RADIUS; dz++) {
      for (let dx = -KEEP_RADIUS; dx <= KEEP_RADIUS; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        if (!this.loaded.has(key)) this.loaded.set(key, this.build(key));
      }
    }
    // One extra ring of hysteresis so walking along a chunk edge does not rebuild every step.
    for (const [key, chunk] of this.loaded) {
      const [kx, kz] = key.split(',').map(Number) as [number, number];
      if (Math.abs(kx - cx) > KEEP_RADIUS + 1 || Math.abs(kz - cz) > KEEP_RADIUS + 1) {
        disposeChunk(chunk);
        this.loaded.delete(key);
      }
    }
  }

  /** Re-reads `props` (after an edit) and rebuilds every loaded chunk. */
  rebuild(): void {
    this.reindex();
    for (const [key, chunk] of this.loaded) {
      disposeChunk(chunk);
      this.loaded.set(key, this.build(key));
    }
  }

  private reindex(): void {
    this.byChunk.clear();
    for (const p of this.props) {
      const key = chunkKey(...chunkOf(p.x, p.z));
      let list = this.byChunk.get(key);
      if (!list) this.byChunk.set(key, (list = []));
      list.push(p);
    }
  }

  private template(kind: PropKind): Template {
    let t = this.templates.get(kind);
    if (t) return t;
    const shapes = BUILDERS[kind](this.scene);
    const parts: Mesh[] = [];
    for (const mat of ['lit', 'glow', 'shaft', 'veil', 'decal'] as const) {
      const meshes = shapes.filter((sh) => sh.mat === mat).map((sh) => sh.mesh);
      if (meshes.length === 0) continue;
      const merged = Mesh.MergeMeshes(meshes, true, true)!;
      merged.name = `prop_${kind}_${mat}`;
      merged.material = this.materials[mat];
      merged.isPickable = false;
      merged.setEnabled(false);
      parts.push(merged);
    }
    t = { parts };
    this.templates.set(kind, t);
    return t;
  }

  private build(key: string): Chunk {
    const props = this.byChunk.get(key) ?? [];
    const byKind = new Map<PropKind, LevelProp[]>();
    for (const p of props) {
      let list = byKind.get(p.kind);
      if (!list) byKind.set(p.kind, (list = []));
      list.push(p);
    }
    const meshes: Mesh[] = [];
    const sprites: Billboard[] = [];
    const bb = this.billboards;
    if (bb) {
      const up = cameraUp();
      for (const [kind, list] of [...byKind]) {
        const entry = bb.atlas.frames[kind];
        if (!entry) continue;
        byKind.delete(kind);
        const { w, h } = entry.frame;
        for (const p of list) {
          const sc = p.scale ?? 1;
          const sp = new Sprite(`prop_${p.id}`, bb.manager);
          sp.cellRef = kind;
          sp.width = (w / PPU) * sc;
          sp.height = (h / PPU) * sc;
          sp.invertU = MIRRORABLE.has(kind) && hash(p.id) % 2 === 1;
          // Stand on the bottom-centre pixel: the sprite faces the camera, so lift its centre along the camera's up axis.
          const half = sp.height / 2;
          const groundZ = p.z - (entry.offsetZ ?? 0) * sc;
          sp.position.set(p.x + up.x * half, p.y + up.y * half, groundZ + up.z * half);
          sprites.push({ sprite: sp, x: p.x, z: groundZ, w: sp.width, h: sp.height });
        }
      }
    }
    const m = new Matrix();
    const q = new Quaternion();
    const scale = new Vector3();
    const pos = new Vector3();
    for (const [kind, list] of byKind) {
      const matrices = new Float32Array(list.length * 16);
      list.forEach((p, i) => {
        const s = p.scale ?? 1;
        scale.set(s, s, s);
        Quaternion.RotationYawPitchRollToRef((p.rot * Math.PI) / 180, 0, 0, q);
        pos.set(p.x, p.y, p.z);
        Matrix.ComposeToRef(scale, q, pos, m);
        m.copyToArray(matrices, i * 16);
      });
      for (const part of this.template(kind).parts) {
        const inst = part.clone(`${part.name}_${key}`, null, true)!;
        // Clones share their Geometry, and Babylon keeps thin-instance matrix buffers on the
        // geometry: without a copy every chunk of a kind would overwrite the others' matrices
        // (with different counts), and the GPU reads past the buffer and draws garbage.
        inst.makeGeometryUnique();
        inst.setEnabled(true);
        inst.thinInstanceSetBuffer('matrix', matrices.slice(), 16, true);
        inst.thinInstanceRefreshBoundingInfo(false);
        meshes.push(inst);
      }
    }
    return { meshes, sprites };
  }
}
