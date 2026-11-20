import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  Scene,
  TargetCamera,
  Vector3,
  type AbstractEngine,
} from '@babylonjs/core';
import { PPU, type LevelArea, type LevelFile, type Vec3 } from '@aranya/shared';
import { CAMERA_FOV_DEG, cameraDistanceFor, cameraOffset, pixelScaleFor } from '../camera/pixelCamera.ts';
import { color, type PaletteName } from '../palette.ts';
import { Atmosphere } from './atmosphere.ts';
import { PropChunks } from './props.ts';
import { buildSurfaces, type AreaSurfaces } from './surfaces.ts';

/** Camera shake never exceeds this many screen pixels (Art Bible 10.7). */
export const MAX_SHAKE_PX = 4;

/** Area floors farther than this from the player (m, outside the area's bounds) are hidden. */
const AREA_VISIBLE_MARGIN = 40;

const c3 = (name: PaletteName): Color3 => Color3.FromHexString(color(name).hex);

export interface World {
  scene: Scene;
  /** Props by chunk; the dev editor edits them in place and rebuilds. */
  props: PropChunks;
  /** Re-centers the locked camera on a world position. */
  follow(target: Vec3): void;
  /** Streams chunks and blends the area mood around the player; call every frame. */
  update(dtMs: number, player: Vec3): void;
  /** Area the player is in (for the dev probe). */
  areaId(): string | null;
  /** Chunks and lights currently in use (dev probe). */
  stats(): { chunks: number; lights: number; billboards: number };
  /** Called when the player enters another area. */
  onAreaChange(cb: (area: LevelArea) => void): void;
  /** Recomputes the integer pixel scale; call after the canvas is resized. */
  resize(): void;
  /** Screen shake in screen pixels (clamped to MAX_SHAKE_PX) for `ms`. */
  shake(px: number, ms: number): void;
}

/**
 * The zone scene, generated from the shared level file (shared/src/levels):
 * walk polygons as low-poly floors, water, greybox props streamed by chunk,
 * and per-area fog, light and particles. What the player sees is exactly what
 * the server collides with.
 */
export function createWorld(engine: AbstractEngine, file: LevelFile): World {
  const scene = new Scene(engine);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = c3('FOREST_DEEP');
  scene.fogDensity = 0.02;

  // Key light from the top-left of the screen (north-west, above), same as the sprites (Art Bible 6, 10.4).
  const sun = new DirectionalLight('sun', new Vector3(1, -1.6, -1).normalize(), scene);
  sun.diffuse = c3('CREAM');
  sun.intensity = 0.9;
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.diffuse = c3('MOSS');
  ambient.groundColor = c3('FOREST_DEEP');
  ambient.intensity = 0.55;

  const areas: AreaSurfaces[] = buildSurfaces(scene, file);
  const props = new PropChunks(scene, file.props);
  const atmosphere = new Atmosphere(scene, file, sun, ambient);
  const bounds = new Map(file.areas.map((a) => [a.id, a.bounds]));

  const update = (dtMs: number, player: Vec3): void => {
    props.update(player);
    props.fadeOccluders(player);
    atmosphere.update(dtMs, player);
    for (const a of areas) {
      const b = bounds.get(a.areaId);
      const near = !b || (player.x > b[0] - AREA_VISIBLE_MARGIN && player.x < b[2] + AREA_VISIBLE_MARGIN && player.z > b[1] - AREA_VISIBLE_MARGIN && player.z < b[3] + AREA_VISIBLE_MARGIN);
      for (const m of a.meshes) if (m.isEnabled() !== near) m.setEnabled(near);
    }
  };

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
  update(0, file.spawn);
  return {
    scene,
    props,
    follow,
    update,
    areaId: () => atmosphere.areaId,
    stats: () => ({ chunks: props.loadedCount, lights: atmosphere.activeLights, billboards: props.billboardCount }),
    onAreaChange: (cb) => {
      atmosphere.onAreaChange = cb;
      // The first area was entered while building the world: report it now.
      const first = file.areas.find((x) => x.id === atmosphere.areaId);
      if (first) cb(first);
    },
    resize,
    shake: shakeCamera,
  };
}
