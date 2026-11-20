/** The 15 palette names in index order (art/palette/aranya-15.gpl; never reorder). */
export const PALETTE_NAMES = [
  'INK', 'FOREST_DEEP', 'FOREST', 'MOSS', 'JADE_DEEP', 'JADE', 'SPIRIT', 'STONE',
  'BARK', 'EARTH', 'GOLD', 'CREAM', 'FIRE', 'PURPLE_DEEP', 'CURSE',
] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export interface PaletteColor {
  index: number;
  name: PaletteName;
  /** sRGB channels, 0..255. */
  r: number;
  g: number;
  b: number;
  hex: string;
}

/**
 * Parses a GIMP palette. `art/palette/aranya-15.gpl` is the single source of
 * truth (Art Bible 3); its index order must never change because LUTs depend on it.
 */
export function parseGpl(text: string): PaletteColor[] {
  const colors: PaletteColor[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([A-Z_]+)\s*$/.exec(line);
    if (!m) continue;
    const [, r, g, b, index, name] = m;
    const rgb = [Number(r), Number(g), Number(b)] as const;
    colors.push({
      index: Number(index),
      name: name as PaletteName,
      r: rgb[0],
      g: rgb[1],
      b: rgb[2],
      hex: '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join(''),
    });
  }
  return colors;
}
