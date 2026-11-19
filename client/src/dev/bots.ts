import { TICK_MS, stepPlayer, type Axis, type Level, type Vec3 } from '@aranya/shared';
import type { CharacterLayer, CharacterSprite } from '../sprites/characterLayer.ts';
import type { OneShot } from '../sprites/animator.ts';

const ACTIONS: OneShot[] = ['attack1', 'attack2', 'attack3', 'skill', 'hit'];

interface Bot {
  sprite: CharacterSprite;
  prev: Vec3;
  pos: Vec3;
  mx: Axis;
  mz: Axis;
  nextTurnMs: number;
}

/** Deterministic PRNG so stress runs are repeatable. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Dev-only render stress test (`?bots=200`): client-side characters that
 * wander with the shared movement rules and play random actions. Not networked.
 */
export class BotSwarm {
  private readonly bots: Bot[] = [];
  private readonly random = rng(1234);
  private accumulator = 0;

  constructor(private readonly level: Level, layer: CharacterLayer, count: number) {
    for (let i = 0; i < count; i++) {
      const pos = { x: -18 + this.random() * 36, y: 0, z: -18 + this.random() * 14 };
      this.bots.push({ sprite: layer.spawn(), prev: pos, pos, mx: 0, mz: 0, nextTurnMs: 0 });
    }
  }

  update(dtMs: number): void {
    this.accumulator = Math.min(this.accumulator + dtMs, TICK_MS * 5);
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      for (const b of this.bots) {
        b.nextTurnMs -= TICK_MS;
        if (b.nextTurnMs <= 0) {
          b.mx = (Math.floor(this.random() * 3) - 1) as Axis;
          b.mz = (Math.floor(this.random() * 3) - 1) as Axis;
          b.nextTurnMs = 800 + this.random() * 1500;
          if (this.random() < 0.25) b.sprite.animator.play(ACTIONS[Math.floor(this.random() * ACTIONS.length)]!);
        }
        b.prev = b.pos;
        b.pos = stepPlayer(this.level, b.pos, b);
      }
    }
    const k = this.accumulator / TICK_MS;
    for (const b of this.bots) {
      b.sprite.update(dtMs, {
        x: b.prev.x + (b.pos.x - b.prev.x) * k,
        y: b.prev.y + (b.pos.y - b.prev.y) * k,
        z: b.prev.z + (b.pos.z - b.prev.z) * k,
      });
    }
  }
}
