import { describe, expect, it } from 'vitest';
import { PLAYER_ANIMS, PLAYER_FRAME_PX } from '@aranya/shared';
import type { SourceSheet } from './aseprite.ts';
import { importHero, rowBands, SHEET_COLS, SHEET_ROWS } from './heroImport.ts';
import { createImage, crop, type Image } from './image.ts';
import { loadPalette } from './paths.ts';
import { validateSheet } from './validate.ts';

const palette = loadPalette();
const CELL = 90;

/** A painted-style 6x9 sheet: soft glow, off-palette colors, a figure per used cell. */
function paintedSheet(): Image {
  const img = createImage(SHEET_COLS * CELL, SHEET_ROWS * CELL);
  const counts = Object.values(PLAYER_ANIMS).map((s) => s.frames);
  const set = (x: number, y: number, rgba: [number, number, number, number]): void => img.data.set(rgba, (y * img.width + x) * 4);
  counts.forEach((n, row) => {
    for (let col = 0; col < n; col++) {
      const ox = col * CELL, oy = row * CELL;
      for (let y = 8; y < CELL - 4; y++) {
        for (let x = 4; x < CELL - 4; x++) {
          const body = x > 30 && x < 60 && y > 10 && y < CELL - 6;
          set(ox + x, oy + y, body ? [235, 228, 200, 250] : [40, 160, 140, 20]); // cream body inside a faint jade glow
        }
      }
      set(ox + 88, oy + 40, [200, 0, 200, 255]); // a stray off-palette speck at the cell edge
    }
  });
  return img;
}

describe('importHero', () => {
  const sheet = paintedSheet();

  it('finds the 9 animation rows', () => {
    expect(rowBands(sheet, SHEET_ROWS)).toHaveLength(SHEET_ROWS);
  });

  it('turns a painted 6x9 E sheet into a compliant 64x64 sheet with all 27 tags', () => {
    const result = importHero({ E: { image: sheet } }, palette);
    expect(result.fallbacks).toHaveLength(2 * 9); // every animation of S and N
    expect(result.fallbacks).toContain('N:attack3');
    expect(result.json.meta.frameTags).toHaveLength(27);

    const frames = (result.json.meta.frameTags ?? []).flatMap((t) =>
      Array.from({ length: t.to - t.from + 1 }, (_, i) => {
        const f = (Object.values(result.json.frames) as { frame: { x: number; y: number }; duration: number }[])[t.from + i]!;
        return { image: crop(result.png, f.frame.x, f.frame.y, PLAYER_FRAME_PX, PLAYER_FRAME_PX), durationMs: f.duration };
      }),
    );
    const converted: SourceSheet = { name: 'test', frames, tags: result.json.meta.frameTags ?? [], frameSize: { w: 64, h: 64 } };
    const { issues } = validateSheet(converted, { palette, frameSize: PLAYER_FRAME_PX, anims: PLAYER_ANIMS });
    expect(issues).toEqual([]);
  });
});
