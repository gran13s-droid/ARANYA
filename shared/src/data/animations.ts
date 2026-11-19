/**
 * Animation specs (Art Bible 5.2). Single source of truth for:
 * - the asset pipeline, which rejects atlases whose tags do not match,
 * - the client animator,
 * - the server, which must time hits with impactMs() (CLAUDE.md: visual/server sync).
 */

/** Directions that are actually drawn; W is E mirrored (Art Bible 4.1). */
export const DRAWN_DIRS = ['S', 'E', 'N'] as const;
export type DrawnDir = (typeof DRAWN_DIRS)[number];
export type FacingDir = DrawnDir | 'W';

export interface AnimSpec {
  frames: number;
  /** Total duration in ms; frames are evenly timed unless the atlas says otherwise. */
  durationMs: number;
  loop: boolean;
  /** 1-based frame on which the hit lands (Art Bible "เฟรมกระทบ"). */
  impactFrame?: number;
  /** Stay on the last frame when finished (death). */
  holdLast?: boolean;
  /** Feet stay on the same baseline in every frame (checked by the pipeline). */
  grounded?: boolean;
}

/** Player body animations required by Step 1.1 (subset of Art Bible 5.2). */
export const PLAYER_ANIMS = {
  idle: { frames: 6, durationMs: 900, loop: true, grounded: true },
  walk: { frames: 6, durationMs: 600, loop: true, grounded: true },
  run: { frames: 6, durationMs: 480, loop: true, grounded: true },
  attack1: { frames: 4, durationMs: 330, loop: false, impactFrame: 2, grounded: true },
  attack2: { frames: 4, durationMs: 330, loop: false, impactFrame: 2, grounded: true },
  attack3: { frames: 6, durationMs: 500, loop: false, impactFrame: 4, grounded: true },
  skill: { frames: 6, durationMs: 500, loop: false, impactFrame: 4, grounded: true },
  hit: { frames: 2, durationMs: 160, loop: false },
  death: { frames: 6, durationMs: 700, loop: false, holdLast: true },
} as const satisfies Record<string, AnimSpec>;

export type PlayerAnim = keyof typeof PLAYER_ANIMS;

/** Player frame size in pixels (Art Bible 4.2). */
export const PLAYER_FRAME_PX = 64;

/** Time from animation start to the impact frame, assuming evenly timed frames. */
export function impactMs(spec: AnimSpec): number | null {
  if (spec.impactFrame === undefined) return null;
  return Math.round(((spec.impactFrame - 1) * spec.durationMs) / spec.frames);
}

/** Aseprite tag name for an animation in a drawn direction (Art Bible 11.2: `<anim>_<dir>`). */
export function tagName(anim: string, dir: DrawnDir): string {
  return `${anim}_${dir}`;
}

/** Frame key inside an atlas: `<anim>_<dir>_<index>` (0-based). */
export function frameKey(anim: string, dir: DrawnDir, index: number): string {
  return `${anim}_${dir}_${index}`;
}
