import type { PaletteColor } from '@aranya/shared';
import type { ImportOptions, SourceSheet } from './aseprite.ts';
import { createImage, type Image } from './image.ts';

/**
 * Converts a painted sheet (soft alpha, thousands of colors, any cell size)
 * into pixel-art frames that satisfy the Art Bible checks:
 * - one uniform scale for every frame (sourceHeight -> targetHeight),
 * - area-averaged downscale, then 1-bit alpha at alphaThreshold,
 * - every opaque pixel snapped to the nearest palette color,
 * - feet (lowest opaque row) moved to one shared baseline, cell center kept centered,
 * - optional 1 px INK outline.
 * Output is for prototyping only (Art Bible 2).
 */

/** Feet row in the converted frame; leaves 2 px for the outline and ground contact. */
const baselineFor = (frameSize: number): number => frameSize - 4;

function downscale(src: Image, scale: number, alphaThreshold: number): { img: Image; alpha: Float32Array } {
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = createImage(w, h);
  const alpha = new Float32Array(w * h);
  const inv = 1 / scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * inv), x1 = Math.min(src.width, Math.ceil((x + 1) * inv));
      const y0 = Math.floor(y * inv), y1 = Math.min(src.height, Math.ceil((y + 1) * inv));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const sa = src.data[i + 3]!;
          r += src.data[i]! * sa;
          g += src.data[i + 1]! * sa;
          b += src.data[i + 2]! * sa;
          a += sa;
          n++;
        }
      }
      const avgA = n ? a / n : 0;
      alpha[y * w + x] = avgA;
      if (avgA >= alphaThreshold && a > 0) out.data.set([r / a, g / a, b / a, 255], (y * w + x) * 4);
    }
  }
  return { img: out, alpha };
}

/** Nearest palette color using a perceptual-ish weighting (red/green/blue: 2/4/3). */
function nearestColor(palette: readonly PaletteColor[], r: number, g: number, b: number): PaletteColor {
  let best = palette[0]!;
  let bestD = Infinity;
  for (const c of palette) {
    const dr = r - c.r, dg = g - c.g, db = b - c.b;
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function addOutline(img: Image, ink: PaletteColor): void {
  const { width: w, height: h, data } = img;
  const opaque = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] === 255;
  const marks: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y) && (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1))) marks.push(y * w + x);
    }
  }
  for (const i of marks) data.set([ink.r, ink.g, ink.b, 255], i * 4);
}

/**
 * Palette-first downscale: every source pixel is snapped to the palette, then
 * each target pixel takes the color that covers most of its area (weighted by
 * alpha). Flat areas (a cream tunic) stay that color instead of averaging
 * towards the dark outline, which reads much more like hand-made pixel art.
 */
function downscaleMode(src: Image, scale: number, alphaThreshold: number, palette: readonly PaletteColor[]): Image {
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = createImage(w, h);
  const inv = 1 / scale;
  const snap = new Map<number, number>();
  const indexOf = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    let idx = snap.get(key);
    if (idx === undefined) {
      idx = palette.indexOf(nearestColor(palette, r, g, b));
      snap.set(key, idx);
    }
    return idx;
  };
  const weights = new Float64Array(palette.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * inv), x1 = Math.min(src.width, Math.ceil((x + 1) * inv));
      const y0 = Math.floor(y * inv), y1 = Math.min(src.height, Math.ceil((y + 1) * inv));
      weights.fill(0);
      let alpha = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3]!;
          alpha += a;
          n++;
          if (a >= alphaThreshold) weights[indexOf(src.data[i]!, src.data[i + 1]!, src.data[i + 2]!)]! += a;
        }
      }
      if (n === 0 || alpha / n < alphaThreshold) continue;
      let best = -1;
      for (let k = 0; k < weights.length; k++) if (weights[k]! > 0 && (best < 0 || weights[k]! > weights[best]!)) best = k;
      if (best < 0) continue;
      const c = palette[best]!;
      out.data.set([c.r, c.g, c.b, 255], (y * w + x) * 4);
    }
  }
  return out;
}

/** Removes opaque islands smaller than `minPixels` (bits of neighbouring cells, glow specks). */
function despeckle(img: Image, minPixels: number): void {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start * 4 + 3] !== 255) continue;
    const island: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      island.push(p);
      const px = p % w, py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!seen[q] && data[q * 4 + 3] === 255) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (island.length < minPixels) for (const p of island) data.set([0, 0, 0, 0], p * 4);
  }
}

export function convertFrame(src: Image, opts: ImportOptions, palette: readonly PaletteColor[]): Image {
  const size = opts.frameSize;
  const scale = opts.targetHeight / opts.sourceHeight;
  const threshold = opts.alphaThreshold ?? 128;
  let small: Image;
  if ((opts.downsample ?? 'mode') === 'mode') {
    small = downscaleMode(src, scale, threshold, palette);
  } else {
    small = downscale(src, scale, threshold).img;
    for (let i = 0; i < small.width * small.height; i++) {
      if (small.data[i * 4 + 3] !== 255) {
        small.data.set([0, 0, 0, 0], i * 4);
        continue;
      }
      const c = nearestColor(palette, small.data[i * 4]!, small.data[i * 4 + 1]!, small.data[i * 4 + 2]!);
      small.data.set([c.r, c.g, c.b, 255], i * 4);
    }
  }
  despeckle(small, opts.minIslandPx ?? 8);

  let lowest = -1;
  for (let y = small.height - 1; y >= 0 && lowest < 0; y--) {
    for (let x = 0; x < small.width; x++) {
      if (small.data[(y * small.width + x) * 4 + 3] === 255) {
        lowest = y;
        break;
      }
    }
  }

  const out = createImage(size, size);
  if (lowest < 0) return out;
  const dx = Math.round(size / 2 - small.width / 2);
  const dy = baselineFor(size) - lowest;
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
      const i = (y * small.width + x) * 4;
      if (small.data[i + 3] === 255) out.data.set(small.data.subarray(i, i + 4), (ty * size + tx) * 4);
    }
  }

  if (opts.outline ?? true) {
    const ink = palette.find((c) => c.name === 'INK');
    if (ink) addOutline(out, ink);
  }
  return out;
}

/** Returns a new sheet with converted 64x64 (frameSize) frames; frames are shared by reference when reused. */
export function convertPaintedSheet(sheet: SourceSheet, palette: readonly PaletteColor[]): SourceSheet {
  const opts = sheet.import;
  if (!opts) return sheet;
  const cache = new Map<Image, Image>();
  const frames = sheet.frames.map((f) => {
    let converted = cache.get(f.image);
    if (!converted) {
      converted = convertFrame(f.image, opts, palette);
      cache.set(f.image, converted);
    }
    return { image: converted, durationMs: f.durationMs };
  });
  return { name: sheet.name, frames, tags: sheet.tags, frameSize: { w: opts.frameSize, h: opts.frameSize } };
}
