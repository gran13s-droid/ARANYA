import { createHash } from 'node:crypto';
import type { AtlasRect } from '@aranya/shared';
import { blit, createImage, type Image } from './image.ts';

export interface PackOptions {
  /** Empty pixels between cells (Art Bible 11.3: 2 px). */
  padding?: number;
  /** Edge pixels duplicated outward so NEAREST sampling never bleeds (Art Bible 11.3: 1 px). */
  extrude?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface PackResult {
  atlas: Image;
  /** Rect of the original (non-extruded) pixels, keyed like the input. */
  rects: Map<string, AtlasRect>;
  uniqueFrames: number;
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/** Copies the outermost pixel rows/columns of the placed frame outward by `extrude` px. */
function extrudeEdges(atlas: Image, x: number, y: number, w: number, h: number, extrude: number): void {
  const copy = (sx: number, sy: number, dx: number, dy: number): void => {
    const s = (sy * atlas.width + sx) * 4;
    atlas.data.copyWithin((dy * atlas.width + dx) * 4, s, s + 4);
  };
  for (let e = 1; e <= extrude; e++) {
    for (let i = 0; i < w; i++) {
      copy(x + i, y, x + i, y - e);
      copy(x + i, y + h - 1, x + i, y + h - 1 + e);
    }
    for (let j = -extrude; j < h + extrude; j++) {
      const sy = Math.min(Math.max(y + j, y), y + h - 1);
      copy(x, sy, x - e, y + j);
      copy(x + w - 1, sy, x + w - 1 + e, y + j);
    }
  }
}

/**
 * Packs equally sized frames into a power-of-two grid atlas. Identical frames
 * (held poses, mirrored timing) are stored once and share a rect.
 */
export function packFrames(frames: readonly { key: string; image: Image }[], options: PackOptions = {}): PackResult {
  const padding = options.padding ?? 2;
  const extrude = options.extrude ?? 1;
  const maxWidth = options.maxWidth ?? 2048;
  const maxHeight = options.maxHeight ?? 2048;
  if (frames.length === 0) throw new Error('nothing to pack');

  const { width: fw, height: fh } = frames[0]!.image;
  for (const f of frames) {
    if (f.image.width !== fw || f.image.height !== fh) throw new Error(`frame ${f.key} has a different size`);
  }

  const unique: Image[] = [];
  const slotOf = new Map<string, number>();
  const keySlot = new Map<string, number>();
  for (const f of frames) {
    const hash = createHash('sha1').update(f.image.data).digest('hex');
    let slot = slotOf.get(hash);
    if (slot === undefined) {
      slot = unique.length;
      unique.push(f.image);
      slotOf.set(hash, slot);
    }
    keySlot.set(f.key, slot);
  }

  const cellW = fw + extrude * 2 + padding;
  const cellH = fh + extrude * 2 + padding;
  let best: { width: number; height: number; cols: number } | null = null;
  for (let width = nextPow2(cellW + padding); width <= maxWidth; width *= 2) {
    const cols = Math.floor((width - padding) / cellW);
    if (cols < 1) continue;
    const rows = Math.ceil(unique.length / cols);
    const height = nextPow2(rows * cellH + padding);
    if (height > maxHeight) continue;
    if (!best || width * height < best.width * best.height) best = { width, height, cols };
  }
  if (!best) throw new Error(`${unique.length} frames of ${fw}x${fh} do not fit in ${maxWidth}x${maxHeight}`);

  const atlas = createImage(best.width, best.height);
  const slotRects: AtlasRect[] = unique.map((img, i) => {
    const x = padding + (i % best.cols) * cellW + extrude;
    const y = padding + Math.floor(i / best.cols) * cellH + extrude;
    blit(atlas, img, x, y);
    extrudeEdges(atlas, x, y, fw, fh, extrude);
    return { x, y, w: fw, h: fh };
  });

  const rects = new Map<string, AtlasRect>();
  for (const [key, slot] of keySlot) rects.set(key, slotRects[slot]!);
  return { atlas, rects, uniqueFrames: unique.length };
}
