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
