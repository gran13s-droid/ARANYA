import {
  DRAWN_DIRS,
  PLAYER_ANIMS,
  PLAYER_FRAME_PX,
  tagName,
  type AnimSpec,
  type DrawnDir,
  type PaletteColor,
  type PlayerAnim,
} from '@aranya/shared';
import type { AseJson, AseTag, ImportOptions } from './aseprite.ts';
import { blit, createImage, crop, type Image } from './image.ts';
import { convertFrame } from './importPainted.ts';

/**
 * Imports per-direction sprite sheets drawn to the placeholder brief:
 * one image per direction (S, E, N), 6 columns x 9 rows, one row per
 * animation in PLAYER_ANIMS order, frames left-aligned. Cells may be any size
 * and painted (soft alpha, off-palette); every frame is converted to a 64x64
 * palette sprite with one shared scale and a shared feet baseline.
 * Missing directions fall back to E (prototype only).
 */

export const SHEET_COLS = 6;
export const SHEET_ROWS = Object.keys(PLAYER_ANIMS).length;
/** Pixels at or above this alpha count as the character when finding rows and sizes. */
const SOLID_ALPHA = 128;

export interface DirectionSheet {
  image: Image;
  /**
   * Animation of each row, top to bottom. Defaults to all of PLAYER_ANIMS in
   * order; set it when a generated sheet skipped or reordered rows.
   */
  rows?: PlayerAnim[];
}

export interface HeroSheets {
  S?: DirectionSheet;
  /** Required and must contain every animation: it is the fallback for the others. */
  E: DirectionSheet;
  N?: DirectionSheet;
}

export const ALL_ROWS = Object.keys(PLAYER_ANIMS) as PlayerAnim[];

export interface HeroImportResult {
  png: Image;
  json: AseJson;
  /** "dir:anim" pairs that reused the E sheet because that sheet/row was missing. */
  fallbacks: string[];
  /** Per direction, cells ("row:col") whose content touches a cut edge. */
  suspicious: Partial<Record<DrawnDir, string[]>>;
  sourceHeight: number;
}

/** Only clearly solid pixels count when looking for gaps; soft glow must not bridge rows. */
const CUT_ALPHA = 200;

/** Solid-pixel count per line along one axis, inside a rectangle. */
function profile(img: Image, axis: 'row' | 'col', x0: number, x1: number, y0: number, y1: number): number[] {
  const out: number[] = [];
  if (axis === 'row') {
    for (let y = y0; y <= y1; y++) {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (img.data[(y * img.width + x) * 4 + 3]! >= CUT_ALPHA) n++;
      out.push(n);
    }
  } else {
    for (let x = x0; x <= x1; x++) {
      let n = 0;
      for (let y = y0; y <= y1; y++) if (img.data[(y * img.width + x) * 4 + 3]! >= CUT_ALPHA) n++;
      out.push(n);
    }
  }
  return out;
}

/**
 * Splits a line profile into `parts` by cutting, near each expected grid line,
 * at the emptiest line (ties go to the one closest to the grid line). AI sheets
 * drift off the grid and glow can fill the gaps, so neither a fixed grid nor
 * "fully empty rows" is reliable on its own.
 */
function cutPoints(prof: number[], parts: number): number[] {
  const len = prof.length;
  const pitch = len / parts;
  const minBand = Math.floor(pitch * 0.75);
  const maxBand = Math.ceil(pitch * 1.25);

  // Cost of cutting at line i: solid pixels crossed (dominant), minus how deep the line is
  // inside an empty gap (so cuts go through the middle of gaps, not along a character's edge).
  const gapDepth = new Array<number>(len).fill(0);
  for (let i = 0, run = 0; i < len; i++) gapDepth[i] = run = prof[i] === 0 ? run + 1 : 0;
  for (let i = len - 1, run = 0; i >= 0; i--) {
    run = prof[i] === 0 ? run + 1 : 0;
    gapDepth[i] = Math.min(gapDepth[i]!, run);
  }
  const lineCost = (i: number): number => prof[i]! * 100 - gapDepth[i]!;

  // Dynamic programming over all cuts at once: every band stays within 75-125% of the
  // grid pitch, and the total crossing cost is minimal. Picking cuts one by one lets a
  // single glowing row pull later cuts through characters.
  const INF = Number.POSITIVE_INFINITY;
  let prev = new Map<number, { cost: number; path: number[] }>([[0, { cost: 0, path: [0] }]]);
  for (let k = 1; k < parts; k++) {
    const next = new Map<number, { cost: number; path: number[] }>();
    for (const [j, state] of prev) {
      for (let i = j + minBand; i <= Math.min(j + maxBand, len - minBand); i++) {
        const cost = state.cost + lineCost(i) + Math.abs(i - j - pitch) * 0.01;
        if (cost < (next.get(i)?.cost ?? INF)) next.set(i, { cost, path: [...state.path, i] });
      }
    }
    prev = next;
  }
  let best: { cost: number; path: number[] } | null = null;
  for (const [j, state] of prev) {
    const last = len - j;
    if (last < minBand || last > maxBand) continue;
    const cost = state.cost + Math.abs(last - pitch) * 0.01;
    if (!best || cost < best.cost) best = { cost, path: state.path };
  }
  if (!best) return Array.from({ length: parts + 1 }, (_, k) => Math.round(k * pitch));
  return [...best.path, len];
}

/** Row ranges [start, end] (inclusive) of a direction sheet. */
export function rowBands(img: Image, rows: number): [number, number][] {
  const cuts = cutPoints(profile(img, 'row', 0, img.width - 1, 0, img.height - 1), rows);
  return Array.from({ length: rows }, (_, r) => [cuts[r]!, cuts[r + 1]! - 1]);
}

/** Cells of one direction sheet: cells[row][col], each cut at the emptiest lines near the grid. */
export function sliceSheet(img: Image, cols = SHEET_COLS, rows = SHEET_ROWS): Image[][] {
  return sliceSheetCells(img, cols, rows).map((row) => row.map((c) => c.image));
}

/** Like sliceSheet, plus each cell's left edge in the sheet. */
export function sliceSheetCells(img: Image, cols: number, rows: number): { image: Image; x: number }[][] {
  return rowBands(img, rows).map(([y0, y1]) => {
    const cuts = cutPoints(profile(img, 'col', 0, img.width - 1, y0, y1), cols);
    return Array.from({ length: cols }, (_, c) => ({ image: crop(img, cuts[c]!, y0, cuts[c + 1]! - cuts[c]!, y1 - y0 + 1), x: cuts[c]! }));
  });
}

/**
 * Cells whose solid content touches the top or bottom edge were probably cut
 * through a character. Returns "row:col" labels for the used cells only.
 */
export function suspiciousCells(cells: Image[][], rows: readonly PlayerAnim[] = ALL_ROWS): string[] {
  const out: string[] = [];
  rows.forEach((anim, row) => {
    for (let col = 0; col < PLAYER_ANIMS[anim].frames; col++) {
      const img = cells[row]?.[col];
      if (!img) continue;
      const rowSolid = (y: number): boolean => {
        for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! >= CUT_ALPHA) return true;
        return false;
      };
      if (rowSolid(0) || rowSolid(img.height - 1)) out.push(`${row + 1}:${col + 1}`);
    }
  });
  return out;
}

export function solidHeight(img: Image): number {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! >= SOLID_ALPHA) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return top < 0 ? 0 : bottom - top + 1;
}

export const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

export function importHero(sheets: HeroSheets, palette: readonly PaletteColor[], name = 'chr_placeholder', targetHeight = 46): HeroImportResult {
  /** Per direction: anim -> cells of its row. */
  const sliced: Partial<Record<DrawnDir, Map<PlayerAnim, Image[]>>> = {};
  const fallbacks: string[] = [];
  const suspicious: HeroImportResult['suspicious'] = {};
  for (const dir of DRAWN_DIRS) {
    const sheet = sheets[dir];
    if (!sheet) continue;
    const rows = sheet.rows ?? ALL_ROWS;
    const cells = sliceSheet(sheet.image, SHEET_COLS, rows.length);
    sliced[dir] = new Map(rows.map((anim, r) => [anim, cells[r]!]));
    const bad = suspiciousCells(cells, rows);
    if (bad.length) suspicious[dir] = bad;
  }
  const east = sliced.E!;
  const missingInEast = ALL_ROWS.filter((a) => !east.has(a));
  if (missingInEast.length) throw new Error(`E sheet must contain every animation; missing ${missingInEast.join(', ')}`);

  // One scale per sheet, from that sheet's idle pose, so the character is the same
  // height in every direction (AI sheets draw each direction at a slightly different size).
  const optsFor = new Map<Map<PlayerAnim, Image[]>, ImportOptions>();
  const scaleFor = (cells: Map<PlayerAnim, Image[]>): ImportOptions => {
    let o = optsFor.get(cells);
    if (!o) {
      const idle = cells.get('idle') ?? east.get('idle')!;
      const h = median(idle.slice(0, PLAYER_ANIMS.idle.frames).map(solidHeight));
      o = { frameSize: PLAYER_FRAME_PX, targetHeight, sourceHeight: h, alphaThreshold: SOLID_ALPHA, outline: true };
      optsFor.set(cells, o);
    }
    return o;
  };
  const sourceHeight = scaleFor(east).sourceHeight;

  const frames: { image: Image; durationMs: number }[] = [];
  const tags: AseTag[] = [];
  const cache = new Map<Image, Image>();
  (Object.entries(PLAYER_ANIMS) as [PlayerAnim, AnimSpec][]).forEach(([anim, spec]) => {
    for (const dir of DRAWN_DIRS) {
      const own = sliced[dir];
      const sheetCells = own?.has(anim) ? own : east;
      if (sheetCells !== own) fallbacks.push(`${dir}:${anim}`);
      const opts = scaleFor(sheetCells);
      const cells = sheetCells.get(anim)!;
      const from = frames.length;
      const base = Math.floor(spec.durationMs / spec.frames);
      for (let i = 0; i < spec.frames; i++) {
        const src = cells[i]!;
        let image = cache.get(src);
        if (!image) {
          image = convertFrame(src, opts, palette);
          cache.set(src, image);
        }
        frames.push({ image, durationMs: i === spec.frames - 1 ? spec.durationMs - base * (spec.frames - 1) : base });
      }
      tags.push({ name: tagName(anim, dir), from, to: frames.length - 1, direction: 'forward' });
    }
  });

  const S = PLAYER_FRAME_PX;
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
    fallbacks,
    suspicious,
    sourceHeight,
    json: {
      frames: jsonFrames as AseJson['frames'],
      meta: { app: 'aranya-tools import-hero (from art/source/characters/hero_ai)', image: `${name}.png`, size: { w: png.width, h: png.height }, frameTags: tags },
    },
  };
}
