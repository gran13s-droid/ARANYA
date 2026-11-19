/** Pixels per world meter. Sprites and scene texel density share this (Art Bible 4, 10.2). */
export const PPU = 32;

/** Server simulation and state-sync rate (CLAUDE.md: Network). */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;

/**
 * Player run speed in meters per second.
 * Provisional value for the tech spike; must be confirmed in the GDD.
 */
export const RUN_SPEED = 5;

/** Max height difference the player can step up or down in one move. */
export const STEP_HEIGHT = 0.5;

/** Player collision radius against obstacles. */
export const PLAYER_RADIUS = 0.4;

/** Delay used to render other players between two received snapshots. */
export const INTERPOLATION_DELAY_MS = 100;

/**
 * Server-side input rate limit: each tick grants one credit and each
 * processed input costs one, so a client can never move faster than
 * one input per tick on average. Credits allow a short catch-up after jitter.
 */
export const MAX_INPUT_CREDITS = 3;

/** Inputs beyond this queue length are dropped (anti-flood). */
export const MAX_QUEUED_INPUTS = 10;
