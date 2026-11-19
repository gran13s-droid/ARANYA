import { PPU } from '@aranya/shared';

/** Vertical field of view (Art Bible 10.1). */
export const CAMERA_FOV_DEG = 30;
/** Downward pitch, matching the angle sprites are drawn at (Art Bible 10.1). */
export const CAMERA_PITCH_DEG = 35;
/** UI and pixel-scale design height (Art Bible 9.1: 640 x 360). */
export const DESIGN_HEIGHT = 360;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Largest integer pixel scale for the viewport height.
 * 720p -> x2, 1080p -> x3, 1440p -> x4 (Art Bible 10.1 / 10.7 table).
 */
export function pixelScaleFor(viewportHeightPx: number): number {
  return Math.max(1, Math.floor(viewportHeightPx / DESIGN_HEIGHT));
}

/**
 * Camera distance from its target so that, on the plane through the target
 * facing the camera, one world meter covers exactly PPU * scale screen pixels.
 * This keeps 32 px sprite pixels mapped to whole screen pixels at the player.
 */
export function cameraDistanceFor(viewportHeightPx: number, scale: number, fovDeg = CAMERA_FOV_DEG): number {
  return viewportHeightPx / (2 * Math.tan(toRad(fovDeg) / 2) * PPU * scale);
}

/** The camera's up axis in world space (sprites face the camera, so their "up" is this). */
export function cameraUp(pitchDeg = CAMERA_PITCH_DEG): { x: number; y: number; z: number } {
  const pitch = toRad(pitchDeg);
  return { x: 0, y: Math.cos(pitch), z: Math.sin(pitch) };
}

/** Offset from target to camera: behind (south of) and above the target; yaw is locked looking north. */
export function cameraOffset(distance: number, pitchDeg = CAMERA_PITCH_DEG): { x: number; y: number; z: number } {
  const pitch = toRad(pitchDeg);
  return { x: 0, y: distance * Math.sin(pitch), z: -distance * Math.cos(pitch) };
}
