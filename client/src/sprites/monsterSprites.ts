import { Sprite, SpriteManager, Texture, type Scene } from '@babylonjs/core';
import { PPU, type AtlasJson, type Vec3 } from '@aranya/shared';
import { cameraUp } from '../camera/pixelCamera.ts';
import { MonsterAnimator } from './monsterAnimator.ts';

/** Most monsters of one species drawn at once (sprite manager capacity). */
const CAPACITY = 64;

export interface MonsterSprite {
  readonly animator: MonsterAnimator;
  /** Places the sprite with its pivot (lowest point of the body) at `feet` and advances the animation. */
  update(dtMs: number, feet: Vec3): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface Species {
  manager: SpriteManager;
  atlas: AtlasJson;
  width: number;
  height: number;
  pivotOffset: number;
}

/**
 * 48x48 monster sprites (Art Bible 4.2, 5.4): one SpriteManager per species
 * atlas, so a species costs one draw call however many are on screen.
 * Species without an atlas keep their low-poly placeholder (world/targets.ts).
 */
export class MonsterSprites {
  private readonly species = new Map<string, Species>();

  constructor(
    private readonly scene: Scene,
    atlases: ReadonlyMap<string, { atlas: AtlasJson; imageUrl: string }>,
  ) {
    for (const [id, { atlas, imageUrl }] of atlases) {
      const { frameSize, pivot } = atlas.meta;
      const manager = new SpriteManager(`monsters_${id}`, imageUrl, CAPACITY, { width: frameSize.w, height: frameSize.h }, this.scene, 0.01, Texture.NEAREST_SAMPLINGMODE, true, JSON.stringify({ frames: atlas.frames }));
      manager.pixelPerfect = true;
      manager.fogEnabled = true;
      manager.isPickable = false;
      this.species.set(id, { manager, atlas, width: frameSize.w / PPU, height: frameSize.h / PPU, pivotOffset: (pivot.y - frameSize.h / 2) / PPU });
    }
  }

  has(species: string): boolean {
    return this.species.has(species);
  }

  get count(): number {
    let n = 0;
    for (const s of this.species.values()) n += s.manager.sprites.length;
    return n;
  }

  spawn(species: string): MonsterSprite {
    const s = this.species.get(species);
    if (!s) throw new Error(`No sprite atlas for monster ${species}`);
    const sprite = new Sprite(`monster_${species}`, s.manager);
    sprite.width = s.width;
    sprite.height = s.height;
    const animator = new MonsterAnimator(s.atlas);
    const up = cameraUp();
    return {
      animator,
      update: (dtMs, feet) => {
        animator.update(dtMs);
        const { key, mirror } = animator.frame();
        sprite.cellRef = key;
        sprite.invertU = mirror;
        // Billboard: offset the center along the camera's up axis so the pivot pixel sits on `feet`.
        sprite.position.set(feet.x + up.x * s.pivotOffset, feet.y + up.y * s.pivotOffset, feet.z + up.z * s.pivotOffset);
      },
      setVisible: (visible) => {
        sprite.isVisible = visible;
      },
      dispose: () => sprite.dispose(),
    };
  }
}
