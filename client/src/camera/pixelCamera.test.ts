import { describe, expect, it } from 'vitest';
import { PPU } from '@aranya/shared';
import { cameraDistanceFor, cameraOffset, pixelScaleFor } from './pixelCamera.ts';

describe('pixel camera', () => {
  it.each([
    [720, 2],
    [1080, 3],
    [1440, 4],
    [300, 1],
  ])('uses scale for %ipx height -> x%i', (h, scale) => {
    expect(pixelScaleFor(h)).toBe(scale);
  });

  it('maps one meter to PPU * scale pixels at the target', () => {
    const h = 1080;
    const scale = pixelScaleFor(h);
    const d = cameraDistanceFor(h, scale);
    const visibleHeightMeters = 2 * d * Math.tan(Math.PI / 12);
    expect(h / visibleHeightMeters).toBeCloseTo(PPU * scale);
  });

  it('shows about 20 m of width when exploring at 1080p (Art Bible 10.1)', () => {
    const widthMeters = 1920 / (PPU * pixelScaleFor(1080));
    expect(widthMeters).toBeCloseTo(20, 0);
  });

  it('places the camera south of and above the target at 35 degrees', () => {
    const o = cameraOffset(10);
    expect(o.x).toBe(0);
    expect(o.z).toBeLessThan(0);
    expect(Math.atan2(o.y, -o.z) * (180 / Math.PI)).toBeCloseTo(35);
  });
});
