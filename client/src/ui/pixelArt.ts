import type { Element, HotbarSkill } from '@aranya/shared';
import { color, type PaletteName } from '../palette.ts';
import { drawDigits, GLYPH_H, textWidth } from './bitmapFont.ts';

/**
 * Placeholder pixel UI drawn in code from the 15-color palette, laid out after
 * the UI concept (reference 2, ref_02_ui_effect.png) within the Art Bible 9
 * rules: round gold portrait ring with a level badge, HP / resource bars in a
 * gold frame with an arrow tip, diamond skill slots with a round icon well and
 * small kanok tips. Everything is drawn at its 640x360 design size and shown
 * at an integer scale with NEAREST sampling, like the final art. Replace with
 * Aseprite art (tracker U-03, U-05) without changing the DOM that uses it.
 *
 * Deviations from the concept on purpose: no baked glow and no blue (Art
 * Bible 2: the resource bar is JADE), digits use the bitmap font (9.1).
 */

type Px = (x: number, y: number, c: PaletteName) => void;

function plotter(ctx: CanvasRenderingContext2D, w: number, h: number): Px {
  return (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    ctx.fillStyle = color(c).hex;
    ctx.fillRect(x, y, 1, 1);
  };
}

const cache = new Map<string, string>();

/** Draws once into an offscreen canvas and caches the PNG data URL. */
function sprite(key: string, w: number, h: number, draw: (px: Px, ctx: CanvasRenderingContext2D) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(plotter(ctx, w, h), ctx);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Midpoint circle ring of radius r centered on (cx, cy) (pixel centers). */
function ring(px: Px, cx: number, cy: number, r: number, c: PaletteName): void {
  for (let a = 0; a < 360; a += 1) {
    const t = (a * Math.PI) / 180;
    px(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), c);
  }
}

function disc(px: Px, cx: number, cy: number, r: number, c: (x: number, y: number) => PaletteName | null): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const k = c(x, y);
        if (k) px(x, y, k);
      }
    }
  }
}

// ------------------------------------------------------------------ skill slot (36x36)

export const SLOT_PX = 36;
/** Radius of the round icon well inside the diamond (icons are 24 px with a 22 px safe area). */
export const WELL_R = 11.5;

export type SlotState = 'ready' | 'cooling' | 'rejected';

/**
 * Diamond slot (Art Bible 9.2): double gold diamond line, a round icon well
 * with a gold ring, and kanok-like tips on the 4 points, as in reference 2.
 */
export function slotFrame(state: SlotState): string {
  return sprite(`slot:${state}`, SLOT_PX, SLOT_PX, (px) => {
    const line: PaletteName = state === 'rejected' ? 'FIRE' : state === 'ready' ? 'GOLD' : 'EARTH';
    const light: PaletteName = state === 'rejected' ? 'CREAM' : state === 'ready' ? 'CREAM' : 'GOLD';
    const c = 17.5;
    // Diamond body: dark backing with an inner and outer gold line.
    for (let y = 0; y < SLOT_PX; y++) {
      for (let x = 0; x < SLOT_PX; x++) {
        const d = Math.abs(x - c) + Math.abs(y - c);
        if (d <= 12) px(x, y, 'FOREST_DEEP');
        else if (d <= 13) px(x, y, 'INK');
        else if (d <= 14) px(x, y, line);
        else if (d <= 15) px(x, y, 'FOREST_DEEP');
        else if (d <= 16) px(x, y, x + y < 36 ? light : line); // lit from the top-left
        else if (d <= 17) px(x, y, 'INK');
      }
    }
    // Round icon well with a gold ring, as in the concept.
    disc(px, c, c, WELL_R + 1.5, () => 'INK');
    disc(px, c, c, WELL_R + 0.5, (x, y) => ((x + y) % 2 === 0 ? 'FOREST_DEEP' : 'JADE_DEEP'));
    ring(px, c, c, WELL_R + 1, line);
    // Kanok tips (Art Bible 9.3: root curl + body + 1 px point), mirrored per side.
    const tip = (x: number, y: number, ox: number, oy: number): void => {
      // (ox, oy) points outward; (sx, sy) runs along the tip.
      const sx = oy;
      const sy = ox;
      px(x, y, light);
      px(x + ox, y + oy, line);
      px(x + sx, y + sy, line);
      px(x - sx, y - sy, line);
      px(x + ox * 2 + sx, y + oy * 2 + sy, line);
    };
    tip(17, 1, 0, -1);
    tip(18, 34, 0, 1);
    tip(1, 18, -1, 0);
    tip(34, 17, 1, 0);
  });
}

// ------------------------------------------------------------------ skill icons (24x24)

export const ICON_PX = 24;

const ICONS: Record<HotbarSkill, (px: Px) => void> = {
  // ฟันกระแสไฟ: a crescent slash over a blade (concept "Attack").
  attack: (px) => {
    for (let a = -1.25; a <= 1.25; a += 0.03) {
      const x = Math.round(10 + Math.cos(a) * 9);
      const y = Math.round(12 + Math.sin(a) * 9);
      px(x, y, 'CREAM');
      px(x - 1, y, 'GOLD');
      px(x - 2, y, 'FIRE');
    }
    for (let i = 0; i < 11; i++) {
      px(4 + i, 19 - i, 'CREAM');
      px(5 + i, 19 - i, 'STONE');
    }
    px(3, 20, 'GOLD');
    px(4, 21, 'GOLD');
    px(2, 19, 'GOLD');
  },
  // ยืนม้าหยก: jade ประจำยาม shield.
  stance: (px) => {
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const d = Math.abs(x - 11.5) + Math.abs(y - 11.5);
        if (d <= 10) px(x, y, d > 9 ? 'INK' : d > 8 ? 'SPIRIT' : d > 6 ? 'JADE' : d > 3 ? 'JADE_DEEP' : 'SPIRIT');
      }
    }
  },
  // ทะยานพยัคฆ์: forward dash with speed lines (concept "Dash").
  lunge: (px) => {
    for (let i = 0; i < 10; i++) {
      px(9 + i, 11, 'CREAM');
      px(9 + i, 12, 'GOLD');
    }
    for (let i = 0; i < 6; i++) {
      px(19 - i, 11 - i, 'CREAM');
      px(19 - i, 12 + i, 'GOLD');
    }
    for (const y of [7, 16]) for (let i = 0; i < 7; i++) px(3 + i, y, 'JADE');
    for (let i = 0; i < 5; i++) px(2 + i, 11, 'JADE');
  },
  // ปัดป้องสวนกลับ: two crossed blades.
  parry: (px) => {
    for (let i = 0; i < 16; i++) {
      px(4 + i, 4 + i, 'STONE');
      px(19 - i, 4 + i, 'CREAM');
    }
    for (const [x, y, s] of [[4, 18, 1], [19, 18, -1]] as const) {
      px(x, y, 'GOLD');
      px(x + s, y + 1, 'GOLD');
      px(x - s, y - 1, 'GOLD');
    }
    px(11, 11, 'JADE');
    px(12, 12, 'JADE');
  },
  // ดาบเพลิงพิชิตมาร: big flame.
  ultimate: (px) => {
    for (let y = 2; y < 22; y++) {
      const half = Math.round(Math.sin(((y - 2) / 20) * Math.PI) * 8);
      for (let x = 12 - half; x <= 12 + half; x++) {
        const edge = Math.abs(x - 12) / Math.max(1, half);
        px(x, y, edge > 0.75 ? 'FIRE' : edge > 0.4 ? 'GOLD' : y > 12 ? 'CREAM' : 'GOLD');
      }
    }
    px(12, 1, 'FIRE');
  },
  potion: (px) => bottle(px, 'FIRE'),
  manaPotion: (px) => bottle(px, 'JADE'),
};

/** Round potion bottle (concept "Potion"); HP is FIRE and the resource potion JADE (Art Bible 2). */
function bottle(px: Px, liquid: PaletteName): void {
  disc(px, 11.5, 15, 7, (x, y) => ((x - 11.5) ** 2 + (y - 15) ** 2 > 36 ? 'INK' : y < 12 ? 'STONE' : liquid));
  for (let y = 4; y < 9; y++) for (let x = 10; x < 14; x++) px(x, y, y < 6 ? 'BARK' : 'STONE');
  px(9, 13, 'CREAM');
  px(8, 14, 'CREAM');
  px(8, 15, 'CREAM');
}

export function skillIcon(skill: HotbarSkill): string {
  return sprite(`icon:${skill}`, ICON_PX, ICON_PX, ICONS[skill]);
}

/** Bitmap digits with an INK outline, e.g. key numbers in a slot corner. */
export function digits(text: string, fill: PaletteName = 'CREAM'): string {
  return sprite(`digits:${text}:${fill}`, textWidth(text) + 2, GLYPH_H + 2, (_px, ctx) => drawDigits(ctx, text, 1, 1, color(fill).hex, color('INK').hex));
}

// ------------------------------------------------------------------ bars

export interface BarStyle {
  fill: PaletteName;
  /** Dithered highlight on the top row of the fill. */
  light: PaletteName;
  /** Trailing ornament after the arrow tip (the concept's gold chevrons). */
  ornament: boolean;
}

export const BAR_HP: BarStyle = { fill: 'FIRE', light: 'GOLD', ornament: true };
export const BAR_RESOURCE: BarStyle = { fill: 'JADE', light: 'SPIRIT', ornament: true };
export const BAR_EXP: BarStyle = { fill: 'GOLD', light: 'CREAM', ornament: false };

/** Extra width the arrow tip and ornament add after the track. */
export function barTail(h: number, style: BarStyle): number {
  return Math.ceil(h / 2) + (style.ornament ? 4 : 0);
}

/**
 * Paints a bar with a gold frame whose right end is an arrow tip (reference 2).
 * `w` is the track width; the canvas must be `w + barTail(h)` wide and `h` high.
 * `k` is the filled fraction 0..1.
 */
export function paintBar(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, style: BarStyle): void {
  const total = w + barTail(h, style);
  ctx.clearRect(0, 0, total, h);
  const px = plotter(ctx, total, h);
  const mid = (h - 1) / 2;
  const fillTo = k >= 1 ? Infinity : 2 + Math.round((w - 2) * Math.max(0, k));
  for (let y = 0; y < h; y++) {
    // Arrow: each row ends further right the closer it is to the middle.
    const end = w + Math.floor(mid - Math.abs(y - mid));
    for (let x = 0; x <= end; x++) {
      const edge = y === 0 || y === h - 1 || x === 0 || x === end;
      const frame = y === 1 || y === h - 2 || x === 1 || x === end - 1;
      if (edge) px(x, y, 'INK');
      else if (frame) px(x, y, y <= mid && x < w ? 'GOLD' : 'EARTH');
      else if (x < fillTo) px(x, y, y === 2 && (x + y) % 2 === 0 ? style.light : style.fill);
      else px(x, y, 'INK');
    }
    // Gold chevron after the tip.
    if (style.ornament) {
      const ox = w + Math.floor(mid) + 3 - Math.round(Math.abs(y - mid));
      if (Math.abs(y - mid) <= mid - 1) px(ox, y, 'GOLD');
    }
  }
}

/** Static world-space HP bar frame for monsters (texture 38x7: track 32 px = 1 m at PPU 32). */
export const WORLD_BAR = { w: 38, h: 7, trackX: 2, trackW: 32, trackY: 2, trackH: 3 } as const;

export function worldBarFrame(): string {
  return sprite('worldBar', WORLD_BAR.w, WORLD_BAR.h, (_px, ctx) => {
    paintBar(ctx, WORLD_BAR.trackW + 2, WORLD_BAR.h, 0, { ...BAR_HP, ornament: false });
  });
}

// ------------------------------------------------------------------ portrait, badge, gems

/**
 * Round portrait (Art Bible 9.2: 48² in a gold circle). `content` paints the
 * inside; the ring is drawn on top.
 */
export function paintPortrait(ctx: CanvasRenderingContext2D, size: number, content: ((ctx: CanvasRenderingContext2D) => void) | null): void {
  const px = plotter(ctx, size, size);
  const c = (size - 1) / 2;
  const r = size / 2 - 1;
  ctx.clearRect(0, 0, size, size);
  disc(px, c, c, r, (x, y) => ((x + y) % 2 === 0 ? 'FOREST_DEEP' : 'FOREST'));
  if (content) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r - 2, 0, Math.PI * 2);
    ctx.clip();
    content(ctx);
    ctx.restore();
  }
  ring(px, c, c, r, 'INK');
  ring(px, c, c, r - 1, 'GOLD');
  ring(px, c, c, r - 2, 'EARTH');
  // Small kanok flourish at the top-left (lit side), as in the concept.
  for (let i = 0; i < 4; i++) px(3 + i, Math.round(c - r + 7 - i * 1.5), 'CREAM');
}

/** Level badge: INK disc, gold ring, 4 ประจำยาม points, bitmap digits (15x15). */
export function levelBadge(level: number): string {
  const text = String(level);
  return sprite(`badge:${text}`, 15, 15, (px, ctx) => {
    disc(px, 7, 7, 6.5, () => 'INK');
    ring(px, 7, 7, 6, 'GOLD');
    for (const [x, y] of [[7, 0], [7, 14], [0, 7], [14, 7]] as const) px(x, y, 'CREAM');
    drawDigits(ctx, text, Math.round(7.5 - textWidth(text) / 2), 4, color('CREAM').hex, null);
  });
}

const ELEMENT_GEM: Record<Element, [PaletteName, PaletteName]> = {
  fire: ['FIRE', 'GOLD'],
  smoke: ['STONE', 'CREAM'],
  jade: ['JADE', 'SPIRIT'],
  dark: ['PURPLE_DEEP', 'CURSE'],
};

/** Element diamond (Art Bible 8.2 element colors), `size` odd. */
export function elementGem(element: Element, size = 9): string {
  return sprite(`gem:${element}:${size}`, size, size, (px) => drawGem(px, element, size));
}

/** Paints an element gem straight into a canvas at (x, y), e.g. inside a portrait. */
export function paintGem(ctx: CanvasRenderingContext2D, element: Element, size: number, x: number, y: number): void {
  const px = plotter(ctx, ctx.canvas.width, ctx.canvas.height);
  drawGem((gx, gy, c) => px(gx + x, gy + y, c), element, size);
}

function drawGem(px: Px, element: Element, size: number): void {
  const [base, light] = ELEMENT_GEM[element];
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - c) + Math.abs(y - c);
      if (d === c) px(x, y, 'INK');
      else if (d === c - 1 && x + y <= size - 2) px(x, y, 'CREAM');
      else if (d < c) px(x, y, x + y < size - 2 ? light : base);
    }
  }
}

/**
 * Integer UI scale (Art Bible 9.1): floor(min(w/640, h/360)) device pixels per
 * UI pixel, returned in CSS pixels.
 */
export function uiPixelSize(innerW: number, innerH: number, dpr: number): number {
  const scale = Math.max(1, Math.floor(Math.min((innerW * dpr) / 640, (innerH * dpr) / 360)));
  return scale / dpr;
}
