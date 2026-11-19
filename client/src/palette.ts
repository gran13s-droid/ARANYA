import { parseGpl, type PaletteColor, type PaletteName } from '@aranya/shared';
import gpl from '../../art/palette/aranya-15.gpl?raw';

export type { PaletteName } from '@aranya/shared';

const byName = new Map(parseGpl(gpl).map((c) => [c.name, c]));

export function color(name: PaletteName): PaletteColor {
  const c = byName.get(name);
  if (!c) throw new Error(`Palette color missing: ${name}`);
  return c;
}
