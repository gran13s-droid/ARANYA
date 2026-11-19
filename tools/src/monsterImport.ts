import {
  DRAWN_DIRS,
  MONSTER_ANIMS,
  MONSTER_FRAME_PX,
  tagName,
  type AnimSpec,
  type DrawnDir,
  type MonsterAnim,
  type PaletteColor,
} from '@aranya/shared';
import type { AseJson, AseTag, ImportOptions } from './aseprite.ts';
import { median, sliceSheetCells, solidHeight } from './heroImport.ts';
import { blit, createImage, removeBackground, type Image } from './image.ts';

/** Extra pixels around the idle bounding box that an isolated frame may still use (a reaching hand). */
const ISOLATE_MARGIN = 3;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function opaqueBox(img: Image, into?: Box): Box | undefined {
  let box = into;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] !== 255) continue;
      if (!box) box = { x0: x, y0: y, x1: x, y1: y };
      else {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  return box;
}

/**
 * Puts a cut cell on the sheet's even grid: a column-pitch-wide image whose
 * center is the grid column's center. Cut lines move to dodge effects (a
 * fireball crossing into the next cell), and converted frames are centered on
 * their image, so without this the body would jump sideways between frames.
 */
function onGrid(cell: Image, cellX: number, col: number, pitch: number): Image {
  const w = Math.round(pitch);
  const out = createImage(w, cell.height);
  const shift = cellX - Math.round(col * pitch);
  for (let y = 0; y < cell.height; y++) {
    for (let x = 0; x < cell.width; x++) {
      const tx = x + shift;
      if (tx < 0 || tx >= w) continue;
      const i = (y * cell.width + x) * 4;
      out.data.set(cell.data.subarray(i, i + 4), (y * w + tx) * 4);
    }
  }
  return out;
}

/** Copy of `img` with everything outside `box` (grown by `margin`) cleared. */
function clipTo(img: Image, box: Box, margin: number): Image {
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (x < box.x0 - margin || x > box.x1 + margin || y < box.y0 - margin || y > box.y1 + margin) out.data.set([0, 0, 0, 0], (y * img.width + x) * 4);
    }
  }
  return out;
}
import { convertFrame } from './importPainted.ts';

/**
 * Imports AI/painted monster sheets drawn to the monster prompt: one image per
 * direction (S, E, N), 5 columns, one row per animation in MONSTER_ANIMS order
 * (idle, move, attack, hit, death), frames left-aligned. Sheets may come on a
 * flat white background. Every frame becomes a 48x48 palette sprite (Art Bible
 * 4.2) with one scale per sheet and a shared baseline. Prototype only (Art Bible 2).
 */

export const MONSTER_SHEET_COLS = 5;
export const MONSTER_ROWS = Object.keys(MONSTER_ANIMS) as MonsterAnim[];

export interface MonsterImportConfig {
  /** Body height in pixels after conversion (Art Bible 4.2: 20-36 for small monsters). */
  targetHeight: number;
  /** Row order of a sheet that skipped, reordered or added rows; null skips a row. */
  rows?: Partial<Record<DrawnDir, (MonsterAnim | null)[]>>;
  /**
   * Frames whose effects beside the body are removed (a thrown projectile, hit
   * marks; the engine draws those itself): "anim" for every frame or "anim:N"
   * (1-based). Everything outside the idle pose's bounding box (+ margin) is cut.
   */
  isolate?: string[];
  /** Palette colors (by name) deleted from every frame, e.g. FIRE hit marks on a monster with no red. */
  dropColors?: string[];
}

export interface MonsterImportResult {
  png: Image;
  json: AseJson;
  /** Directions that reused another sheet (symmetric monsters may only have S). */
  fallbacks: string[];
  /** Idle height in source pixels per direction. */
  sourceHeights: Partial<Record<DrawnDir, number>>;
}

/** Fallback order for a missing direction: symmetric monsters are drawn facing S only (Art Bible 5.4). */
const FALLBACK: readonly DrawnDir[] = ['S', 'E', 'N'];

function isolated(config: MonsterImportConfig, anim: MonsterAnim, frame: number): boolean {
  return (config.isolate ?? []).some((rule) => rule === anim || rule === `${anim}:${frame}`);
}

export function importMonster(
  sheets: Partial<Record<DrawnDir, Image>>,
  config: MonsterImportConfig,
  palette: readonly PaletteColor[],
  name: string,
): MonsterImportResult {
  const sliced: Partial<Record<DrawnDir, Map<MonsterAnim, Image[]>>> = {};
  for (const dir of DRAWN_DIRS) {
    const image = sheets[dir];
    if (!image) continue;
    removeBackground(image);
    const rows = config.rows?.[dir] ?? MONSTER_ROWS;
    const pitch = image.width / MONSTER_SHEET_COLS;
    const cells = sliceSheetCells(image, MONSTER_SHEET_COLS, rows.length);
    const map = new Map<MonsterAnim, Image[]>();
    rows.forEach((anim, r) => {
      if (anim) map.set(anim, cells[r]!.map((c, col) => onGrid(c.image, c.x, col, pitch)));
    });
    const missing = MONSTER_ROWS.filter((a) => !map.has(a));
    if (missing.length) throw new Error(`${name} ${dir} sheet is missing rows: ${missing.join(', ')}`);
    sliced[dir] = map;
  }
  const available = FALLBACK.filter((d) => sliced[d]);
  if (available.length === 0) throw new Error(`${name}: no sheets`);

  // One scale per sheet from its idle pose, so the monster is the same size in every direction.
  const sourceHeights: MonsterImportResult['sourceHeights'] = {};
  const baseOpts = new Map<DrawnDir, ImportOptions>();
  for (const dir of available) {
    const idle = sliced[dir]!.get('idle')!.slice(0, MONSTER_ANIMS.idle.frames);
    const h = median(idle.map(solidHeight));
    sourceHeights[dir] = h;
    baseOpts.set(dir, {
      frameSize: MONSTER_FRAME_PX,
      targetHeight: config.targetHeight,
      sourceHeight: h,
      alphaThreshold: 128,
      outline: true,
      ...(config.dropColors ? { dropColors: config.dropColors } : {}),
    });
  }

  // The body's extent per sheet: the union of its converted idle frames.
  const convert = new Map<Image, Image>();
  const converted = (cell: Image, dir: DrawnDir): Image => {
    let image = convert.get(cell);
    if (!image) convert.set(cell, (image = convertFrame(cell, baseOpts.get(dir)!, palette)));
    return image;
  };
  const bodyBox = new Map<DrawnDir, Box>();
  for (const dir of available) {
    let box: Box | undefined;
    for (const cell of sliced[dir]!.get('idle')!.slice(0, MONSTER_ANIMS.idle.frames)) box = opaqueBox(converted(cell, dir), box);
    if (box) bodyBox.set(dir, box);
  }

  const fallbacks: string[] = [];
  const frames: { image: Image; durationMs: number }[] = [];
  const tags: AseTag[] = [];
  const clipped = new Map<Image, Image>();
  (Object.entries(MONSTER_ANIMS) as [MonsterAnim, AnimSpec][]).forEach(([anim, spec]) => {
    for (const dir of DRAWN_DIRS) {
      const src = sliced[dir] ? dir : available[0]!;
      if (src !== dir) fallbacks.push(`${dir}<-${src}`);
      const cells = sliced[src]!.get(anim)!;
      const from = frames.length;
      const base = Math.floor(spec.durationMs / spec.frames);
      for (let i = 0; i < spec.frames; i++) {
        const cell = cells[i];
        if (!cell) throw new Error(`${name} ${src} ${anim}: frame ${i + 1} missing`);
        let image = converted(cell, src);
        const box = bodyBox.get(src);
        if (box && isolated(config, anim, i + 1)) {
          const full = image;
          image = clipped.get(full) ?? clipTo(full, box, ISOLATE_MARGIN);
          clipped.set(full, image);
        }
        frames.push({ image, durationMs: i === spec.frames - 1 ? spec.durationMs - base * (spec.frames - 1) : base });
      }
      tags.push({ name: tagName(anim, dir), from, to: frames.length - 1, direction: 'forward' });
    }
  });

  const S = MONSTER_FRAME_PX;
  const sheetCols = 16;
  const png = createImage(sheetCols * S, Math.ceil(frames.length / sheetCols) * S);
  const jsonFrames: Record<string, unknown> = {};
  frames.forEach((f, i) => {
    const x = (i % sheetCols) * S;
    const y = Math.floor(i / sheetCols) * S;
    blit(png, f.image, x, y);
    jsonFrames[`${name} ${i}`] = { frame: { x, y, w: S, h: S }, rotated: false, trimmed: false, sourceSize: { w: S, h: S }, duration: f.durationMs };
  });

  return {
    png,
    fallbacks: [...new Set(fallbacks)],
    sourceHeights,
    json: {
      frames: jsonFrames as AseJson['frames'],
      meta: { app: `aranya-tools import-monster (${name})`, image: `${name}.png`, size: { w: png.width, h: png.height }, frameTags: tags },
    },
  };
}
