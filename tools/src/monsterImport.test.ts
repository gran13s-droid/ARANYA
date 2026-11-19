import { describe, expect, it } from 'vitest';
import { MONSTER_ANIMS, MONSTER_FRAME_PX } from '@aranya/shared';
import type { SourceSheet } from './aseprite.ts';
import { createImage, crop, removeBackground, type Image } from './image.ts';
import { importMonster, MONSTER_ROWS, MONSTER_SHEET_COLS } from './monsterImport.ts';
import { loadPalette } from './paths.ts';
import { validateSheet } from './validate.ts';

const palette = loadPalette();
const CELL = 120;

/**
 * An AI-style monster sheet on a flat white background: a brown body with a
 * cream face in every used cell, plus a jade "fireball" beside the body in
 * attack frame 3.
 */
function whiteSheet(): Image {
  const img = createImage(MONSTER_SHEET_COLS * CELL, MONSTER_ROWS.length * CELL);
  img.data.fill(255);
  const set = (x: number, y: number, rgb: [number, number, number]): void => img.data.set([...rgb, 255], (y * img.width + x) * 4);
  MONSTER_ROWS.forEach((anim, row) => {
    for (let col = 0; col < MONSTER_ANIMS[anim].frames; col++) {
      const ox = col * CELL, oy = row * CELL;
      for (let y = 15; y < 105; y++) for (let x = 40; x < 80; x++) set(ox + x, oy + y, y < 45 && x > 50 && x < 70 ? [242, 229, 196] : [74, 48, 36]);
      if (anim === 'attack' && col === 2) for (let y = 50; y < 66; y++) for (let x = 98; x < 116; x++) set(ox + x, oy + y, [45, 181, 151]);
    }
  });
  return img;
}

describe('removeBackground', () => {
  it('clears the white border-connected background but keeps light areas inside the body', () => {
    const img = whiteSheet();
    removeBackground(img);
    const alphaAt = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3]!;
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(60, 30)).toBe(255); // cream face
  });
});

describe('importMonster', () => {
  it('turns a white-background 5x5 sheet into a valid 48 px atlas, S reused for E and N', () => {
    const result = importMonster({ S: whiteSheet() }, { targetHeight: 30, isolate: ['attack:3'] }, palette, 'mon_test');
    expect(result.fallbacks).toEqual(['E<-S', 'N<-S']);
    const tags = result.json.meta.frameTags ?? [];
    expect(tags).toHaveLength(MONSTER_ROWS.length * 3);

    const list = Object.values(result.json.frames) as { frame: { x: number; y: number }; duration: number }[];
    const frames = list.map((f) => ({ image: crop(result.png, f.frame.x, f.frame.y, MONSTER_FRAME_PX, MONSTER_FRAME_PX), durationMs: f.duration }));
    const sheet: SourceSheet = { name: 'mon_test', frames, tags, frameSize: { w: MONSTER_FRAME_PX, h: MONSTER_FRAME_PX } };
    expect(validateSheet(sheet, { palette, frameSize: MONSTER_FRAME_PX, anims: MONSTER_ANIMS }).issues).toEqual([]);

    // The fireball beside the body in attack frame 3 is cut: no jade pixels remain there.
    const attack3 = frames[tags.find((t) => t.name === 'attack_S')!.from + 2]!.image;
    let jade = 0;
    for (let i = 0; i < attack3.width * attack3.height; i++) if (attack3.data[i * 4 + 1] === 181) jade++;
    expect(jade).toBe(0);
  });
});
