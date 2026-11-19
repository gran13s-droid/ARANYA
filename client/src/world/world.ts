import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TargetCamera,
  Vector3,
  VertexBuffer,
  VertexData,
  type AbstractEngine,
} from '@babylonjs/core';
import { PPU, type Level, type Vec3, type WalkPoly } from '@aranya/shared';
import { CAMERA_FOV_DEG, cameraDistanceFor, cameraOffset, pixelScaleFor } from '../camera/pixelCamera.ts';
import { color, type PaletteName } from '../palette.ts';

/** Camera shake never exceeds this many screen pixels (Art Bible 10.7). */
export const MAX_SHAKE_PX = 4;

const c3 = (name: PaletteName): Color3 => Color3.FromHexString(color(name).hex);

function flatMaterial(scene: Scene, name: PaletteName): StandardMaterial {
  const m = new StandardMaterial(`mat_${name}`, scene);
  m.diffuseColor = c3(name);
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  return m;
}

/**
 * Gives each triangle of a flat-shaded mesh one color from a small set, so a
 * flat surface still reads as low-poly. Deterministic (no Math.random) so every
 * client sees the same ground.
 */
function paintFacets(mesh: Mesh, tones: readonly Color3[]): void {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let tri = 0; tri < count / 3; tri++) {
    const tone = tones[(tri * 7 + (tri >> 3) * 3) % tones.length]!;
    for (let k = 0; k < 3; k++) colors.set([tone.r, tone.g, tone.b, 1], (tri * 3 + k) * 4);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

/** Builds a closed prism from a walk polygon down to `bottomY` (the visual of a walkable surface). */
function prismFromPoly(scene: Scene, poly: WalkPoly, bottomY: (y: number) => number): Mesh {
  const top = poly.verts;
  const n = top.length;
  const positions: number[] = [];
  for (const v of top) positions.push(v.x, v.y, v.z);
  for (const v of top) positions.push(v.x, bottomY(v.y), v.z);
  const indices: number[] = [];
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + i, j, j, n + i, n + j);
  }
  const mesh = new Mesh(`walk_${poly.id}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh();
  return mesh;
}

export interface World {
  scene: Scene;
  /** Re-centers the locked camera on a world position. */
  follow(target: Vec3): void;
  /** Recomputes the integer pixel scale; call after the canvas is resized. */
  resize(): void;
  /** Screen shake in screen pixels (clamped to MAX_SHAKE_PX) for `ms`. */
  shake(px: number, ms: number): void;
}

/**
 * Tech-spike scene: low-poly ground, three trees, dark-green fog and the
 * multi-level test geometry. Everything walkable or blocking is generated from
 * the shared Level data, so what the player sees is exactly what the server collides with.
 */
export function createWorld(engine: AbstractEngine, level: Level): World {
  const scene = new Scene(engine);
  const fog = c3('FOREST_DEEP');
  scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.022;
  scene.fogColor = fog;

  // Key light from the top-left of the screen (north-west, above), same as the sprites (Art Bible 6).
  const sun = new DirectionalLight('sun', new Vector3(1, -1.6, -1).normalize(), scene);
  sun.diffuse = c3('CREAM');
  sun.intensity = 0.9;
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.diffuse = c3('MOSS');
  ambient.groundColor = c3('FOREST_DEEP');
  ambient.intensity = 0.55;

  const matGround = flatMaterial(scene, 'FOREST');
  matGround.diffuseColor = Color3.White(); // tint comes from per-facet vertex colors
  const matStone = flatMaterial(scene, 'STONE');
  const matBark = flatMaterial(scene, 'BARK');
  const matLeaves = flatMaterial(scene, 'FOREST');
  const matLeavesLight = flatMaterial(scene, 'MOSS');

  for (const poly of level.polys) {
    if (poly.id === 'ground') {
      const ground = MeshBuilder.CreateGround('ground', { width: 48, height: 48, subdivisions: 16 }, scene);
      ground.convertToFlatShadedMesh();
      paintFacets(ground, [c3('FOREST'), Color3.Lerp(c3('FOREST'), c3('MOSS'), 0.15), Color3.Lerp(c3('FOREST'), c3('FOREST_DEEP'), 0.2)]);
      ground.material = matGround;
      continue;
    }
    const mesh = poly.solid ? prismFromPoly(scene, poly, () => 0) : prismFromPoly(scene, poly, (y) => y - 0.3);
    mesh.material = poly.solid ? matStone : matBark;
  }

  level.obstacles.forEach((o, i) => {
    const trunk = MeshBuilder.CreateCylinder(`trunk_${i}`, { height: 2.4, diameterTop: 0.35, diameterBottom: 0.6, tessellation: 6 }, scene);
    trunk.position.set(o.x, o.yMin + 1.2, o.z);
    trunk.material = matBark;
    trunk.convertToFlatShadedMesh();
    const canopy = MeshBuilder.CreateIcoSphere(`canopy_${i}`, { radius: 1.8, subdivisions: 1 }, scene);
    canopy.position.set(o.x, o.yMin + 3.4, o.z);
    canopy.scaling.y = 0.8;
    canopy.material = i % 2 === 0 ? matLeaves : matLeavesLight;
  });

  const camera = new TargetCamera('camera', Vector3.Zero(), scene);
  camera.fov = (CAMERA_FOV_DEG * Math.PI) / 180;
  camera.minZ = 0.5;
  camera.maxZ = 200;

  let distance = 20;
  let scale = 3;
  const lastTarget = Vector3.Zero();
  let shake = { px: 0, until: 0 };

  const resize = (): void => {
    const h = engine.getRenderHeight();
    scale = pixelScaleFor(h);
    distance = cameraDistanceFor(h, scale);
  };

  const follow = (target: Vec3): void => {
    // Screen shake: whole-pixel offsets only, at most MAX_SHAKE_PX (Art Bible 10.7: 4 px).
    let sx = 0;
    let sz = 0;
    if (performance.now() < shake.until) {
      const m = 1 / (PPU * scale);
      sx = Math.round((Math.random() * 2 - 1) * shake.px) * m;
      sz = Math.round((Math.random() * 2 - 1) * shake.px) * m;
    }
    lastTarget.set(target.x + sx, target.y, target.z + sz);
    const o = cameraOffset(distance);
    camera.position.set(lastTarget.x + o.x, lastTarget.y + o.y, lastTarget.z + o.z);
    camera.setTarget(lastTarget);
  };

  const shakeCamera = (px: number, ms: number): void => {
    shake = { px: Math.min(MAX_SHAKE_PX, Math.max(shake.px, px)), until: performance.now() + ms };
  };

  resize();
  follow(lastTarget);
  return { scene, follow, resize, shake: shakeCamera };
}
