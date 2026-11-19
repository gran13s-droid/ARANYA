import { describe, expect, it } from 'vitest';
import { PLAYER_ANIMS, PLAYER_FRAME_PX, impactMs } from '@aranya/shared';
import { parseAsepriteJson, type SourceSheet } from './aseprite.ts';
import { buildAtlas } from './buildAtlas.ts';
import { createImage, pixel, type Image } from './image.ts';
import { convertPaintedSheet } from './importPainted.ts';
import { packFrames } from './pack.ts';
import { loadPalette } from './paths.ts';
import { generatePlaceholder } from './placeholder.ts';
import { validateSheet } from './validate.ts';

const palette = loadPalette();
const rules = { palette, frameSize: PLAYER_FRAME_PX, anims: PLAYER_ANIMS };

function solid(w: number, h: number, rgba: [number, number, number, number]): Image {
  const img = createImage(w, h);
  for (let i = 0; i < w * h; i++) img.data.set(rgba, i * 4);
  return img;
}

describe('placeholder character', () => {
  const { sheet, json } = generatePlaceholder(palette);

  it('passes every automated Art Bible check', () => {
    const { issues, pivot } = validateSheet(sheet, rules);
    expect(issues).toEqual([]);
    expect(pivot?.x).toBe(32);
  });

  it('has one tag per animation and drawn direction (3 directions, not 8)', () => {
    expect(sheet.tags).toHaveLength(Object.keys(PLAYER_ANIMS).length * 3);
    expect(sheet.tags.map((t) => t.name)).toContain('run_E');
    expect(sheet.tags.some((t) => t.name.endsWith('_W'))).toBe(false);
  });

  it('round-trips through the Aseprite JSON shape', () => {
    const parsed = parseAsepriteJson(json);
    expect(parsed.frames).toHaveLength(sheet.frames.length);
    expect(parsed.tags).toEqual(sheet.tags);
  });
});

describe('validateSheet', () => {
  const base = generatePlaceholder(palette).sheet;
  const withFrame0 = (image: Image): SourceSheet => ({ ...base, frames: [{ ...base.frames[0]!, image }, ...base.frames.slice(1)] });

  it('rejects colors outside the palette', () => {
    const img = createImage(64, 64);
    img.data.set([255, 0, 255, 255], 0);
    const { issues } = validateSheet(withFrame0(img), rules);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('outside the 15-color palette'))).toBe(true);
  });

  it('rejects semi-transparent pixels', () => {
    const img = createImage(64, 64);
    img.data.set([20, 27, 26, 128], 0);
    const { issues } = validateSheet(withFrame0(img), rules);
    expect(issues.some((i) => i.message.includes('semi-transparent'))).toBe(true);
  });

  it('rejects a wrong frame size and missing tags', () => {
    const { issues } = validateSheet({ ...base, frameSize: { w: 48, h: 48 }, tags: base.tags.slice(1) }, rules);
    expect(issues.some((i) => i.message.includes('expected 64x64'))).toBe(true);
    expect(issues.some((i) => i.message.includes('missing tag "idle_S"'))).toBe(true);
  });

  it('rejects impact timing that does not match the server', () => {
    const tag = base.tags.find((t) => t.name === 'attack1_S')!;
    const frames = base.frames.map((f, i) => (i === tag.from ? { ...f, durationMs: 200 } : f));
    const { issues } = validateSheet({ ...base, frames }, rules);
    expect(issues.some((i) => i.message.includes(`server uses ${impactMs(PLAYER_ANIMS.attack1)} ms`))).toBe(true);
  });

  it('rejects feet that are not on one baseline', () => {
    const tag = base.tags.find((t) => t.name === 'idle_S')!;
    const shifted = createImage(64, 64);
    shifted.data.set(base.frames[tag.from]!.image.data.subarray(64 * 4), 0); // move everything up 1 px
    const frames = base.frames.map((f, i) => (i === tag.from ? { ...f, image: shifted } : f));
    const { issues } = validateSheet({ ...base, frames }, rules);
    expect(issues.some((i) => i.message.includes('one baseline'))).toBe(true);
  });
});

describe('packFrames', () => {
  it('adds padding and 1 px extrusion around every frame', () => {
    const { atlas, rects } = packFrames([{ key: 'a', image: solid(4, 4, [1, 2, 3, 255]) }], { padding: 2, extrude: 1 });
    const r = rects.get('a')!;
    expect(r).toMatchObject({ x: 3, y: 3, w: 4, h: 4 });
    expect(pixel(atlas, r.x - 1, r.y - 1)).toEqual([1, 2, 3, 255]); // extruded corner
    expect(pixel(atlas, r.x + r.w, r.y + r.h)).toEqual([1, 2, 3, 255]);
    expect(pixel(atlas, r.x - 2, r.y)).toEqual([0, 0, 0, 0]); // padding stays empty
  });

  it('stores identical frames once and never overlaps rects', () => {
    const frames = [
      { key: 'a', image: solid(8, 8, [10, 0, 0, 255]) },
      { key: 'b', image: solid(8, 8, [10, 0, 0, 255]) },
      ...Array.from({ length: 30 }, (_, i) => ({ key: `c${i}`, image: solid(8, 8, [i, 1, 1, 255]) })),
    ];
    const { rects, uniqueFrames, atlas } = packFrames(frames);
    expect(uniqueFrames).toBe(31);
    expect(rects.get('a')).toEqual(rects.get('b'));
    const distinct = [...new Set([...rects.values()])];
    for (const r of distinct) {
      expect(r.x + r.w).toBeLessThanOrEqual(atlas.width);
      expect(r.y + r.h).toBeLessThanOrEqual(atlas.height);
      for (const o of distinct) {
        if (o === r) continue;
        const overlap = r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2;
        expect(overlap).toBe(false);
      }
    }
    expect(Math.log2(atlas.width) % 1).toBe(0);
    expect(Math.log2(atlas.height) % 1).toBe(0);
  });

  it('fails clearly when frames do not fit the size budget', () => {
    const frames = Array.from({ length: 5 }, (_, i) => ({ key: `f${i}`, image: solid(64, 64, [i, 0, 0, 255]) }));
    expect(() => packFrames(frames, { maxWidth: 128, maxHeight: 128 })).toThrow(/do not fit/);
  });
});

describe('convertPaintedSheet', () => {
  /** A soft-edged, off-palette "painted" figure in a 111x117 cell, feet at y = 100. */
  function paintedCell(shift: number): Image {
    const img = createImage(111, 117);
    for (let y = 0; y < 117; y++) {
      for (let x = 0; x < 111; x++) {
        const inside = x > 35 && x < 75 && y > 0 + shift && y <= 100 + shift;
        const edge = x === 35 || x === 75;
        if (inside) img.data.set([200, 120 + (x % 7), 90, 250], (y * 111 + x) * 4);
        else if (edge) img.data.set([30, 30, 30, 90], (y * 111 + x) * 4);
      }
    }
    return img;
  }

  it('turns painted cells into 64x64 frames that pass every check', () => {
    const base = generatePlaceholder(palette).sheet;
    const painted: SourceSheet = {
      ...base,
      frameSize: { w: 111, h: 117 },
      frames: base.frames.map((f, i) => ({ ...f, image: paintedCell(i % 3) })),
      import: { frameSize: 64, targetHeight: 46, sourceHeight: 100, alphaThreshold: 128, outline: true },
    };
    const converted = convertPaintedSheet(painted, palette);
    expect(converted.frameSize).toEqual({ w: 64, h: 64 });
    const { issues } = validateSheet(converted, rules);
    expect(issues).toEqual([]);
  });

  it('leaves normal pixel-art sheets untouched', () => {
    const { sheet } = generatePlaceholder(palette);
    expect(convertPaintedSheet(sheet, palette)).toBe(sheet);
  });
});

describe('buildAtlas', () => {
  it('produces a runtime atlas within the Art Bible 4.3 budget with every animation', () => {
    const { sheet } = generatePlaceholder(palette);
    const result = buildAtlas(sheet, rules, 'chr_procedural.png', { maxWidth: 1024, maxHeight: 2048 });
    if (!('json' in result)) throw new Error(JSON.stringify(result.issues));
    expect(result.image.width).toBeLessThanOrEqual(1024);
    expect(result.image.height).toBeLessThanOrEqual(2048);
    const run = result.json.animations['run_E']!;
    expect(run.frames).toHaveLength(PLAYER_ANIMS.run.frames);
    expect(run.loop).toBe(true);
    expect(result.json.animations['death_S']!.holdLast).toBe(true);
    for (const key of run.frames) expect(result.json.frames[key]).toBeDefined();
    expect(result.json.meta.pivot.x).toBe(32);
  });
});
