import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

/** Straight-alpha RGBA8 image. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createImage(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Lossless PNG only: sprites must never be lossy-compressed (Art Bible 11.3). */
export function writePng(path: string, img: Image): void {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

export function crop(src: Image, x: number, y: number, w: number, h: number): Image {
  const out = createImage(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * src.width + x) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

export function blit(dst: Image, src: Image, dx: number, dy: number): void {
  for (let row = 0; row < src.height; row++) {
    const from = row * src.width * 4;
    dst.data.set(src.data.subarray(from, from + src.width * 4), ((dy + row) * dst.width + dx) * 4);
  }
}

export function pixel(img: Image, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

/**
 * Makes a flat light background transparent (AI sheets often come on solid
 * white). Flood-fills from the image border through pixels whose channels are
 * all at least `threshold`, so light areas inside the character (a cream mask)
 * stay. Then peels `halo` rings of light anti-aliasing (channels >= haloThreshold)
 * off the character's edge.
 */
export function removeBackground(img: Image, threshold = 232, halo = 2, haloThreshold = 205): number {
  const { width: w, height: h, data } = img;
  const light = (i: number, t: number): boolean => data[i * 4 + 3]! > 0 && data[i * 4]! >= t && data[i * 4 + 1]! >= t && data[i * 4 + 2]! >= t;
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (!bg[i] && light(i, threshold)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  const neighbours = (i: number): number[] => {
    const x = i % w, y = (i - x) / w;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < w - 1) out.push(i + 1);
    if (y > 0) out.push(i - w);
    if (y < h - 1) out.push(i + w);
    return out;
  };
  while (stack.length) for (const n of neighbours(stack.pop()!)) seed(n);
  for (let ring = 0; ring < halo; ring++) {
    const peel: number[] = [];
    for (let i = 0; i < w * h; i++) if (!bg[i] && light(i, haloThreshold) && neighbours(i).some((n) => bg[n])) peel.push(i);
    for (const i of peel) bg[i] = 1;
  }
  let cleared = 0;
  for (let i = 0; i < w * h; i++) {
    if (bg[i] && data[i * 4 + 3] !== 0) {
      data.set([0, 0, 0, 0], i * 4);
      cleared++;
    }
  }
  return cleared;
}
