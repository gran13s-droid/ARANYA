import type { AtlasJson, FacingDir, PlayerAnim } from '@aranya/shared';
import { toDrawn } from './facing.ts';

export type Locomotion = 'idle' | 'walk' | 'run';
export type OneShot = Exclude<PlayerAnim, Locomotion>;

/** Below this ground speed the character stands; below RUN_THRESHOLD it walks. */
const MOVE_THRESHOLD = 0.2;
const RUN_THRESHOLD = 3;

/**
 * Animation state machine for one character (Step 1.1).
 * Locomotion (idle / walk / run) follows ground speed. One-shots (attacks,
 * skill, hit) play once and return to locomotion; death holds its last frame
 * until revive(). Purely a visual layer: gameplay timing comes from the server.
 */
export class CharacterAnimator {
  facing: FacingDir = 'S';
  private anim: PlayerAnim = 'idle';
  private elapsed = 0;
  private dead = false;
  private locomotion: Locomotion = 'idle';

  constructor(private readonly atlas: AtlasJson) {}

  get current(): PlayerAnim {
    return this.anim;
  }

  get isDead(): boolean {
    return this.dead;
  }

  setSpeed(speedMps: number): void {
    this.locomotion = speedMps < MOVE_THRESHOLD ? 'idle' : speedMps < RUN_THRESHOLD ? 'walk' : 'run';
    if (!this.dead && this.isLocomotion(this.anim) && this.anim !== this.locomotion) this.switchTo(this.locomotion);
  }

  play(anim: OneShot): void {
    if (this.dead) return;
    if (anim === 'death') this.dead = true;
    this.switchTo(anim);
  }

  revive(): void {
    this.dead = false;
    this.switchTo(this.locomotion);
  }

  /** Drops a one-shot the server rejected and returns to locomotion. */
  cancel(): void {
    if (!this.dead && !this.isLocomotion(this.anim)) this.switchTo(this.locomotion);
  }

  /** Hit stop: holds the current frame for a moment so hits feel heavy. */
  freeze(ms: number): void {
    this.frozenMs = Math.max(this.frozenMs, ms);
  }

  private frozenMs = 0;

  update(dtMs: number): void {
    if (this.frozenMs > 0) {
      const used = Math.min(this.frozenMs, dtMs);
      this.frozenMs -= used;
      dtMs -= used;
    }
    this.elapsed += dtMs;
    const clip = this.clip();
    const total = clip.durations.reduce((a, b) => a + b, 0);
    if (!clip.loop && this.elapsed >= total && !clip.holdLast) this.switchTo(this.locomotion);
  }

  /** Atlas frame key to draw now, and whether to mirror it (facing W). */
  frame(): { key: string; mirror: boolean } {
    const clip = this.clip();
    const { mirror } = toDrawn(this.facing);
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
    if (!clip) throw new Error(`Atlas has no animation ${this.anim}_${dir}`);
    return clip;
  }

  private isLocomotion(a: PlayerAnim): a is Locomotion {
    return a === 'idle' || a === 'walk' || a === 'run';
  }

  private switchTo(anim: PlayerAnim): void {
    this.anim = anim;
    this.elapsed = 0;
  }
}
