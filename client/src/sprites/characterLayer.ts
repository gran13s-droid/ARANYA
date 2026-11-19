import {
  Color3,
  Matrix,
  MeshBuilder,
  Quaternion,
  Sprite,
  SpriteManager,
  StandardMaterial,
  Texture,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import { PPU, floorAt, normalOf, type AtlasJson, type Level, type Vec3 } from '@aranya/shared';
import { cameraUp } from '../camera/pixelCamera.ts';
import { color } from '../palette.ts';
import { CharacterAnimator } from './animator.ts';
import { facingFromMove } from './facing.ts';

/** Shadow sits slightly above the floor to avoid z-fighting. */
const SHADOW_LIFT = 0.03;

export interface CharacterSprite {
  readonly animator: CharacterAnimator;
  /**
   * Places the character with its feet at `feet`. Facing and walk/run follow
   * the movement since the last update unless `intent` (the local player's
   * input) is given, which turns the sprite immediately even against a wall.
   */
  update(dtMs: number, feet: Vec3, intent?: { mx: number; mz: number }): void;
  dispose(): void;
}

/**
 * Draws every character that shares one atlas with a single SpriteManager
 * (1 draw call) plus one thin-instanced blob shadow mesh (1 draw call),
 * so 200 characters cost 2 draw calls (ROADMAP Step 1.1).
 */
export class CharacterLayer {
  private readonly manager: SpriteManager;
  private readonly shadow: Mesh;
  private readonly shadowMatrices: Float32Array;
  private readonly members = new Set<Member>();
  private readonly widthM: number;
  private readonly heightM: number;
  /** Distance from the sprite center to the feet pixel, along the camera's up axis. */
  private readonly pivotOffsetM: number;

  constructor(
    scene: Scene,
    private readonly level: Level,
    private readonly atlas: AtlasJson,
    imageUrl: string,
    readonly capacity = 256,
  ) {
    const { frameSize, pivot } = atlas.meta;
    this.widthM = frameSize.w / PPU;
    this.heightM = frameSize.h / PPU;
    this.pivotOffsetM = (pivot.y - frameSize.h / 2) / PPU;

    this.manager = new SpriteManager('characters', imageUrl, capacity, { width: frameSize.w, height: frameSize.h }, scene, 0.01, Texture.NEAREST_SAMPLINGMODE, true, JSON.stringify({ frames: atlas.frames }));
    this.manager.pixelPerfect = true;
    this.manager.fogEnabled = true;
    this.manager.isPickable = false;

    const mat = new StandardMaterial('blobShadowMat', scene);
    mat.diffuseColor = Color3.FromHexString(color('INK').hex);
    mat.emissiveColor = mat.diffuseColor;
    mat.disableLighting = true;
    mat.specularColor = Color3.Black();
    mat.alpha = 0.35;
    mat.zOffset = -1;
    this.shadow = MeshBuilder.CreateDisc('blobShadow', { radius: 0.45, tessellation: 12 }, scene);
    this.shadow.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
    this.shadow.material = mat;
    this.shadow.isPickable = false;
    this.shadow.alwaysSelectAsActiveMesh = true;
    this.shadowMatrices = new Float32Array(capacity * 16);
    this.shadow.thinInstanceSetBuffer('matrix', this.shadowMatrices, 16, false);
    this.shadow.thinInstanceCount = 0;

    scene.onBeforeRenderObservable.add(() => this.flushShadows());
  }

  get count(): number {
    return this.members.size;
  }

  spawn(): CharacterSprite {
    if (this.members.size >= this.capacity) throw new Error(`CharacterLayer is full (${this.capacity})`);
    const sprite = new Sprite('character', this.manager);
    sprite.width = this.widthM;
    sprite.height = this.heightM;
    const member: Member = { sprite, animator: new CharacterAnimator(this.atlas), feet: { x: 0, y: 0, z: 0 }, last: null };
    this.members.add(member);

    const up = cameraUp();
    return {
      animator: member.animator,
      update: (dtMs, feet, intent) => {
        const a = member.animator;
        if (member.last && dtMs > 0) {
          const dx = feet.x - member.last.x;
          const dz = feet.z - member.last.z;
          a.setSpeed((Math.hypot(dx, dz) / dtMs) * 1000);
          if (!intent) a.facing = facingFromMove(dx, dz, a.facing, 1e-3);
        }
        if (intent) a.facing = facingFromMove(intent.mx, intent.mz, a.facing);
        a.update(dtMs);

        const { key, mirror } = a.frame();
        sprite.cellRef = key;
        sprite.invertU = mirror;
        // Put the pivot pixel (feet) exactly on the ground point: the sprite faces
        // the camera, so offset its center along the camera's up axis.
        sprite.position.set(feet.x + up.x * this.pivotOffsetM, feet.y + up.y * this.pivotOffsetM, feet.z + up.z * this.pivotOffsetM);
        member.feet = feet;
        member.last = { ...feet };
      },
      dispose: () => {
        sprite.dispose();
        this.members.delete(member);
      },
    };
  }

  /** Writes one shadow matrix per character, tilted to the floor it stands on. */
  private flushShadows(): void {
    const scale = new Vector3(1.3, 1, 1);
    const rot = new Quaternion();
    const pos = new Vector3();
    const n = new Vector3();
    const m = new Matrix();
    let i = 0;
    for (const member of this.members) {
      const floor = floorAt(this.level, member.feet);
      const normal = floor ? normalOf(floor) : { x: 0, y: 1, z: 0 };
      n.set(normal.x, normal.y, normal.z);
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), n, rot);
      pos.set(member.feet.x + n.x * SHADOW_LIFT, member.feet.y + n.y * SHADOW_LIFT, member.feet.z + n.z * SHADOW_LIFT);
      Matrix.ComposeToRef(scale, rot, pos, m);
      m.copyToArray(this.shadowMatrices, i * 16);
      i++;
    }
    this.shadow.thinInstanceCount = i;
    this.shadow.thinInstanceBufferUpdated('matrix');
  }
}

interface Member {
  sprite: Sprite;
  animator: CharacterAnimator;
  feet: Vec3;
  last: Vec3 | null;
}
