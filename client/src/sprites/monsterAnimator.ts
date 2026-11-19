import { MONSTER_ANIMS, type AtlasJson, type FacingDir, type MonsterAnim } from '@aranya/shared';
import { toDrawn } from './facing.ts';

/** Below this ground speed (m/s) the monster idles. */
const MOVE_THRESHOLD = 0.2;
/** Wind-up pulses between attack frames 1 and 2 at this rate (ms per frame). */
const WINDUP_FRAME_MS = 180;
/** 0-based attack frame where the hit lands (Art Bible 5.4: frame 3). */
const IMPACT_INDEX = (MONSTER_ANIMS.attack.impactFrame ?? 3) - 1;

/**
 * Animation state machine for one monster sprite. Purely visual: the server
 * decides when attacks start and land, the client only follows its events.
 * - attack: frames 1-2 pulse for the whole telegraph, then frames 3-5 play
 *   from the impact frame when it ends (the hit lands on frame 3).
 * - death (purify) holds its last frame until revive().
 */
export class MonsterAnimator {
  facing: FacingDir = 'S';
  private anim: MonsterAnim = 'idle';
  private elapsed = 0;
  private windupLeft = 0;
  private moving = false;

  constructor(private readonly atlas: AtlasJson) {}

  get current(): MonsterAnim {
    return this.anim;
  }

  get isDead(): boolean {
    return this.anim === 'death';
  }

  /** True once the purify animation has played to its last frame. */
  get deathFinished(): boolean {
    return this.anim === 'death' && this.elapsed >= MONSTER_ANIMS.death.durationMs;
  }

  setSpeed(mps: number): void {
    this.moving = mps >= MOVE_THRESHOLD;
    if (this.anim === 'idle' || this.anim === 'move') {
      const next = this.moving ? 'move' : 'idle';
      if (next !== this.anim) this.switchTo(next);
    }
  }

  /** Server telegraph started: hold the wind-up for `ms`, then release. */
  windup(ms: number): void {
    if (this.isDead) return;
    this.switchTo('attack');
    this.windupLeft = ms;
  }

  hit(): void {
    if (this.anim === 'idle' || this.anim === 'move') this.switchTo('hit');
  }

  die(): void {
    if (!this.isDead) this.switchTo('death');
  }

  revive(): void {
    this.switchTo(this.moving ? 'move' : 'idle');
  }

  update(dtMs: number): void {
    if (this.anim === 'attack' && this.windupLeft > 0) {
      this.windupLeft -= dtMs;
      this.elapsed += dtMs;
      if (this.windupLeft <= 0) {
        // Release: start on the impact frame, carrying over the overshoot.
        const clip = this.clip();
        this.elapsed = clip.durations.slice(0, IMPACT_INDEX).reduce((a, b) => a + b, 0) - this.windupLeft;
        this.windupLeft = 0;
      }
      return;
    }
    this.elapsed += dtMs;
    const spec = MONSTER_ANIMS[this.anim];
    if (!spec.loop && !('holdLast' in spec && spec.holdLast) && this.elapsed >= spec.durationMs) this.revive();
  }

  /** Atlas frame key to draw now, and whether to mirror it (facing W). */
  frame(): { key: string; mirror: boolean } {
    const clip = this.clip();
    const { mirror } = toDrawn(this.facing);
    if (this.anim === 'attack' && this.windupLeft > 0) {
      const pulse = Math.floor(this.elapsed / WINDUP_FRAME_MS) % 2;
      return { key: clip.frames[Math.min(pulse, clip.frames.length - 1)]!, mirror };
    }
    const total = clip.durations.reduce((a, b) => a + b, 0);
    let t = clip.loop ? this.elapsed % total : Math.min(this.elapsed, total - 1);
    let index = 0;
    while (index < clip.durations.length - 1 && t >= clip.durations[index]!) {
      t -= clip.durations[index]!;
      index++;
    }
    return { key: clip.frames[index]!, mirror };
  }

  private clip(): AtlasJson['animations'][string] {
    const { dir } = toDrawn(this.facing);
    const clip = this.atlas.animations[`${this.anim}_${dir}`];
    if (!clip) throw new Error(`Monster atlas has no animation ${this.anim}_${dir}`);
    return clip;
  }

  private switchTo(anim: MonsterAnim): void {
    this.anim = anim;
    this.elapsed = 0;
    this.windupLeft = 0;
  }
}
