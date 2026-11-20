import { levelCollision } from '../levels/index.ts';

/**
 * Tech-spike test level (shared/src/levels/spike.json): a 3 m platform reached
 * by a ramp, a bridge over a walkable path, and no falling off edges (Art
 * Bible 10.12). Upper levels sit north of lower ones so they never hide them
 * from the camera. Used by tests and the `?level=spike` training ground.
 */
export const SPIKE_LEVEL = levelCollision('spike');
