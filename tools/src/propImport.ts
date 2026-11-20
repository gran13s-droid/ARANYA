import { PPU, PROP_KINDS, type PaletteColor, type PropAtlasJson } from '@aranya/shared';
import { blit, createImage, crop, removeBackground, removeEnclosedWhite, type Image } from './image.ts';
import { despeckle, downscaleMode, islands } from './importPainted.ts';

/**
 * Cuts prop billboards out of painted concept sheets (prototype only, Art
 * Bible 2): crop the configured rectangle, remove the white background, keep
 * the object (largest island plus the islands overlapping it), scale it so it
 * stands `heightM` metres tall at 32 px/m, snap to the 15-colour palette, and
 * pack every prop into one atlas. The client draws these frames as
 * camera-facing sprites standing on their bottom-centre pixel.
 */

export interface PropSpriteSpec {
  /** Prop kind this picture replaces (PROP_KINDS). */
  kind: string;
  /** Concept sheet file name in art/reference/concept/. */
  source: string;
  /** [x, y, w, h] in source pixels; generous is fine, the object is trimmed. */
  rect: [number, number, number, number];
  /** Height of the object in metres (Art Bible 10.2 scale). */
  heightM: number;
  /** The picture's bottom stands this many metres south of the prop (it shows ground in front of the object). */
  offsetZ?: number;
}

export interface PropImportConfig {
  sprites: PropSpriteSpec[];
}

/** Alpha above which a pixel counts as the object. */
const SOLID = 128;
/** Islands smaller than this share of the largest one are dropped (bits of neighbouring objects). */
const MIN_ISLAND_SHARE = 0.02;

function bbox(img: Image): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! < SOLID) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** Keeps the largest island and the sizeable islands whose bounding box overlaps it; clears the rest. */
function keepObject(img: Image): void {
  const solid = createImage(img.width, img.height);
  for (let i = 0; i < img.width * img.height; i++) if (img.data[i * 4 + 3]! >= SOLID) solid.data[i * 4 + 3] = 255;
  const all = islands(solid);
  if (all.length < 2) return;
  const box = (isl: number[]): [number, number, number, number] => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const p of isl) {
      const x = p % img.width, y = (p - x) / img.width;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return [x0, y0, x1, y1];
  };
  const main = all.reduce((a, b) => (b.length > a.length ? b : a));
  const [mx0, my0, mx1, my1] = box(main);
  for (const isl of all) {
    if (isl === main) continue;
    const [x0, y0, x1, y1] = box(isl);
    const overlaps = x0 <= mx1 && x1 >= mx0 && y0 <= my1 && y1 >= my0;
    if (!overlaps || isl.length < main.length * MIN_ISLAND_SHARE) for (const p of isl) img.data.set([0, 0, 0, 0], p * 4);
  }
}

/** One prop picture: trimmed, scaled to its height at PPU, palette-snapped. */
export function convertProp(sheet: Image, spec: PropSpriteSpec, palette: readonly PaletteColor[], targetPx = spec.heightM * PPU): Image {
  const [x, y, w, h] = spec.rect;
  const cut = crop(sheet, Math.max(0, x), Math.max(0, y), Math.min(w, sheet.width - x), Math.min(h, sheet.height - y));
  // Painted drop shadows are neutral light grey: treat them as background (the engine draws its own shadow).
  removeBackground(cut, 232, 2, 205, { min: 178, spread: 24 });
  removeEnclosedWhite(cut, 120);
  keepObject(cut);
  const b = bbox(cut);
  if (!b) throw new Error(`${spec.kind}: nothing left in rect ${spec.rect.join(',')} of ${spec.source}`);
  const trimmed = crop(cut, b[0], b[1], b[2], b[3]);
  const small = downscaleMode(trimmed, targetPx / b[3], SOLID, palette);
  despeckle(small, 6);
  const t = bbox(small);
  return t ? crop(small, t[0], t[1], t[2], t[3]) : small;
}

/** Shelf-packs the frames (tallest first) into a 1024-wide power-of-two atlas with 1 px of padding. */
export function packProps(frames: Map<string, Image>, imageFile: string, offsets: ReadonlyMap<string, number> = new Map(), width = 1024): { png: Image; json: PropAtlasJson } {
  const PAD = 2;
  const order = [...frames.entries()].sort((a, b) => b[1].height - a[1].height);
  let x = 0, y = 0, rowH = 0;
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const [kind, img] of order) {
    if (img.width + PAD > width) throw new Error(`${kind} is wider than the atlas`);
    if (x + img.width + PAD > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    rects.set(kind, { x: x + 1, y: y + 1, w: img.width, h: img.height });
    x += img.width + PAD;
    rowH = Math.max(rowH, img.height + PAD);
  }
  let height = 1;
  while (height < y + rowH) height *= 2;
  const png = createImage(width, height);
  const json: PropAtlasJson = { frames: {}, meta: { image: imageFile, size: { w: width, h: height }, kind: 'props' } };
  for (const [kind, r] of rects) {
    blit(png, frames.get(kind)!, r.x, r.y);
    const offsetZ = offsets.get(kind);
    json.frames[kind] = offsetZ ? { frame: r, offsetZ } : { frame: r };
  }
  return { png, json };
}

export function validateConfig(config: PropImportConfig): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of config.sprites) {
    if (!(s.kind in PROP_KINDS)) out.push(`unknown prop kind "${s.kind}"`);
    if (seen.has(s.kind)) out.push(`prop kind "${s.kind}" listed twice`);
    seen.add(s.kind);
    if (!(s.heightM > 0)) out.push(`${s.kind}: heightM must be > 0`);
  }
  return out;
}
