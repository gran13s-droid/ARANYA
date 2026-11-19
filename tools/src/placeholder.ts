import {
  DRAWN_DIRS,
  PLAYER_ANIMS,
  PLAYER_FRAME_PX,
  tagName,
  type AnimSpec,
  type DrawnDir,
  type PaletteColor,
  type PaletteName,
} from '@aranya/shared';
import type { AseJson, AseTag, SourceSheet } from './aseprite.ts';
import { blit, createImage, type Image } from './image.ts';

/**
 * Procedural stand-in for the Hero sprite (tracker C-02) so the whole pipeline
 * can be exercised before real art exists. It follows the real rules: 64x64
 * frames, ~45 px tall chibi, palette colors only, 1-bit alpha, INK outline,
 * feet on one baseline, and the four Hero read points (jade scarf, ponytail,
 * twin swords, gold belt; Art Bible 7.1).
 */

const S = PLAYER_FRAME_PX;
/** Row of the lowest foot pixel. */
const BASE = 60;

type Pal = (name: PaletteName) => [number, number, number];

class Canvas {
  readonly img: Image = createImage(S, S);
  constructor(private readonly pal: Pal) {}

  /** Nothing is drawn below the feet, so the outline baseline stays identical in every frame. */
  set(x: number, y: number, c: PaletteName): void {
    if (x < 0 || y < 0 || x >= S || y > BASE) return;
    const [r, g, b] = this.pal(c);
    this.img.data.set([r, g, b, 255], (y * S + x) * 4);
  }

  rect(x: number, y: number, w: number, h: number, c: PaletteName): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: PaletteName): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  private opaque(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < S && y < S && this.img.data[(y * S + x) * 4 + 3] === 255;
  }

  /** 1 px INK outline around everything drawn so far (Art Bible 6.1). */
  outline(): void {
    const marks: [number, number][] = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) marks.push([x, y]);
      }
    }
    // The outline may sit one row under the feet: that row is the shared baseline.
    const [r, g, b] = this.pal('INK');
    for (const [x, y] of marks) this.img.data.set([r, g, b, 255], (y * S + x) * 4);
  }
}

interface Pose {
  /** Vertical offset of head + torso (positive = down). */
  bob: number;
  /** Leg lift in px for [left, right] leg (feet never go below BASE). */
  lift: [number, number];
  /** Horizontal stride for side view: offset of [back, front] foot. */
  stride: [number, number];
  /** Sword angle in degrees (0 = pointing in facing direction, -90 = up), or null to sheath. */
  sword: number | null;
  slash: boolean;
  orb: number;
  flash: boolean;
  /** 0 = standing, 1 = fully fallen. */
  fall: number;
}

const STAND: Pose = { bob: 0, lift: [0, 0], stride: [0, 0], sword: null, slash: false, orb: 0, flash: false, fall: 0 };

function poseFor(anim: string, i: number, spec: AnimSpec): Pose {
  const n = spec.frames;
  const t = i / n;
  const step = Math.sin(t * Math.PI * 2);
  switch (anim) {
    case 'idle':
      return { ...STAND, bob: i === 2 || i === 3 || i === 4 ? 1 : 0, sword: 40 };
    case 'walk':
      return { ...STAND, bob: i % 3 === 1 ? 1 : 0, lift: step > 0.3 ? [2, 0] : step < -0.3 ? [0, 2] : [0, 0], stride: [Math.round(-step * 2), Math.round(step * 2)], sword: 40 };
    case 'run':
      return { ...STAND, bob: i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 1, lift: step > 0 ? [3, 0] : [0, 3], stride: [Math.round(-step * 4), Math.round(step * 4)], sword: 60 };
    case 'attack1':
    case 'attack2':
    case 'attack3':
    case 'skill': {
      const impact = (spec.impactFrame ?? 1) - 1;
      if (anim === 'skill') return { ...STAND, bob: i < impact ? 1 : 0, sword: -80, orb: i <= impact ? i + 1 : Math.max(0, n - i), flash: i === impact };
      const from = anim === 'attack2' ? 60 : -100;
      const to = anim === 'attack2' ? -60 : 30;
      const k = Math.min(1, i / Math.max(1, impact));
      return { ...STAND, bob: anim === 'attack3' && i === impact ? 2 : 0, stride: [-2, 2], sword: from + (to - from) * k, slash: i === impact };
    }
    case 'hit':
      return { ...STAND, bob: 1, flash: i === 0, sword: 50 };
    case 'death':
      return { ...STAND, fall: Math.min(1, t * 1.25 + 0.05), sword: null };
    default:
      return STAND;
  }
}

function drawFigure(c: Canvas, dir: DrawnDir, p: Pose): void {
  const cx = 32;
  if (p.fall > 0.6) {
    // Lying on the ground: a horizontal body, head towards the facing side.
    const y = BASE - 7;
    c.rect(cx - 16, y, 22, 7, 'JADE_DEEP');
    c.rect(cx - 6, y + 1, 2, 5, 'GOLD');
    c.rect(cx + 6, y - 2, 11, 9, 'CREAM');
    c.rect(cx + 6, y - 2, 11, 3, 'BARK');
    c.rect(cx - 20, y + 2, 4, 4, 'BARK');
    c.outline();
    return;
  }
  const sink = Math.round(p.fall * 12);
  const top = BASE - 44 + p.bob + sink;
  const torsoTop = top + 21;
  const body: PaletteName = p.flash ? 'CREAM' : 'JADE_DEEP';

  // Legs (BARK trousers), feet always end on BASE unless lifted.
  if (dir === 'E') {
    const [back, front] = p.stride;
    c.rect(cx - 3 + back, torsoTop + 14, 4, BASE - (torsoTop + 14) + 1 - p.lift[0], 'BARK');
    c.rect(cx + 1 + front, torsoTop + 14, 4, BASE - (torsoTop + 14) + 1 - p.lift[1], 'EARTH');
  } else {
    c.rect(cx - 6, torsoTop + 14, 4, BASE - (torsoTop + 14) + 1 - p.lift[0], 'BARK');
    c.rect(cx + 2, torsoTop + 14, 4, BASE - (torsoTop + 14) + 1 - p.lift[1], 'BARK');
  }

  // Torso + gold belt.
  c.rect(cx - 8, torsoTop, 16, 15, body);
  c.rect(cx - 8, torsoTop + 10, 16, 2, 'GOLD');

  // Head (18 px) with hair; face depends on direction.
  const headTop = top + 3;
  c.rect(cx - 9, headTop, 18, 18, 'CREAM');
  c.rect(cx - 9, headTop, 18, 5, 'BARK');
  c.rect(cx - 3, top, 6, 3, 'BARK'); // top knot
  if (dir === 'S') {
    c.rect(cx - 9, headTop + 5, 2, 7, 'BARK');
    c.rect(cx + 7, headTop + 5, 2, 7, 'BARK');
    c.rect(cx - 5, headTop + 9, 2, 3, 'INK');
    c.rect(cx + 3, headTop + 9, 2, 3, 'INK');
  } else if (dir === 'N') {
    c.rect(cx - 9, headTop, 18, 15, 'BARK');
    c.rect(cx - 1, headTop + 15, 3, 9, 'BARK'); // ponytail down the back
  } else {
    c.rect(cx - 9, headTop, 8, 14, 'BARK');
    c.rect(cx + 4, headTop + 9, 2, 3, 'INK');
    c.rect(cx - 13, headTop + 4, 4, 8, 'BARK'); // ponytail behind
  }

  // Jade scarf: the main read point; tails flow away from the facing side.
  c.rect(cx - 9, torsoTop - 1, 18, 3, 'JADE');
  if (dir === 'E') c.rect(cx - 12, torsoTop, 4, 6, 'JADE');
  else if (dir === 'N') c.rect(cx - 2, torsoTop + 2, 5, 5, 'JADE');

  // Sword from the front hand.
  if (p.sword !== null) {
    const hand = dir === 'E' ? { x: cx + 6, y: torsoTop + 7 } : { x: cx + 9, y: torsoTop + 8 };
    const facing = dir === 'E' ? 0 : dir === 'S' ? 90 : -90;
    const a = ((facing + p.sword) * Math.PI) / 180;
    const len = 14;
    const ex = Math.round(hand.x + Math.cos(a) * len * (dir === 'E' ? 1 : 0.5));
    const ey = Math.round(hand.y + Math.sin(a) * len * (dir === 'E' ? 1 : 0.6));
    c.line(hand.x, hand.y, ex, ey, 'STONE');
    c.rect(hand.x - 1, hand.y - 1, 2, 2, 'GOLD');
    if (p.slash) {
      for (let k = 0; k < 7; k++) {
        const aa = a - 0.9 + (k * 1.8) / 6;
        c.set(Math.round(hand.x + Math.cos(aa) * (len + 3)), Math.round(hand.y + Math.sin(aa) * (len + 3)), 'CREAM');
      }
    }
  }

  // Skill: spirit orb gathering above the head.
  if (p.orb > 0) {
    const r = Math.min(4, p.orb);
    c.rect(cx - r, top - 3 - r * 2, r * 2, r * 2, p.flash ? 'CREAM' : 'SPIRIT');
  }

  c.outline();
}

export interface PlaceholderExport {
  sheet: SourceSheet;
  png: Image;
  json: AseJson;
}

/** Builds the placeholder as if exported by Aseprite (json-hash, one tag per anim+dir). */
export function generatePlaceholder(palette: readonly PaletteColor[], name = 'chr_placeholder'): PlaceholderExport {
  const byName = new Map(palette.map((p) => [p.name, p]));
  const pal: Pal = (n) => {
    const c = byName.get(n);
    if (!c) throw new Error(`palette color ${n} missing`);
    return [c.r, c.g, c.b];
  };

  const frames: { image: Image; durationMs: number }[] = [];
  const tags: AseTag[] = [];
  for (const [anim, spec] of Object.entries(PLAYER_ANIMS) as [string, AnimSpec][]) {
    for (const dir of DRAWN_DIRS) {
      const from = frames.length;
      for (let i = 0; i < spec.frames; i++) {
        const c = new Canvas(pal);
        drawFigure(c, dir, poseFor(anim, i, spec));
        // Evenly timed; the last frame absorbs rounding so the total is exact.
        const base = Math.floor(spec.durationMs / spec.frames);
        const durationMs = i === spec.frames - 1 ? spec.durationMs - base * (spec.frames - 1) : base;
        frames.push({ image: c.img, durationMs });
      }
      tags.push({ name: tagName(anim, dir), from, to: frames.length - 1, direction: 'forward' });
    }
  }

  const cols = 16;
  const png = createImage(cols * S, Math.ceil(frames.length / cols) * S);
  const jsonFrames: AseJson['frames'] = {};
  frames.forEach((f, i) => {
    const x = (i % cols) * S;
    const y = Math.floor(i / cols) * S;
    blit(png, f.image, x, y);
    (jsonFrames as Record<string, unknown>)[`${name} ${i}.aseprite`] = {
      frame: { x, y, w: S, h: S },
      rotated: false,
      trimmed: false,
      sourceSize: { w: S, h: S },
      duration: f.durationMs,
    };
  });

  return {
    sheet: { name, frames, tags, frameSize: { w: S, h: S } },
    png,
    json: {
      frames: jsonFrames,
      meta: { app: 'aranya-tools placeholder generator', image: `${name}.png`, size: { w: png.width, h: png.height }, frameTags: tags },
    },
  };
}
