/**
 * 5x7 bitmap digits (Art Bible 9.1 / V-11: HUD and damage numbers use a
 * hand-made bitmap font; all other text is a vector font).
 */
export const GLYPHS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/** Width in pixels of `text` drawn at `scale` with 1 px spacing. */
export function textWidth(text: string, scale = 1): number {
  const n = [...text].filter((c) => GLYPHS[c]).length;
  return n === 0 ? 0 : n * (GLYPH_W + 1) * scale - scale;
}

/** Draws digits with an optional 1 px outline (4-neighbour). */
export function drawDigits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, outline: string | null, scale = 1): void {
  const glyphs = [...text].map((c) => GLYPHS[c]).filter((g): g is readonly string[] => !!g);
  const plot = (color: string, dx: number, dy: number): void => {
    ctx.fillStyle = color;
    glyphs.forEach((g, gi) => {
      g.forEach((row, gy) => {
        for (let gx = 0; gx < GLYPH_W; gx++) {
          if (row[gx] === '1') ctx.fillRect(x + gi * (GLYPH_W + 1) * scale + gx * scale + dx, y + gy * scale + dy, scale, scale);
        }
      });
    });
  };
  if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) plot(outline, dx, dy);
  plot(fill, 0, 0);
}
