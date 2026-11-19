import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGpl, type PaletteColor } from '@aranya/shared';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PALETTE_GPL = `${REPO_ROOT}art/palette/aranya-15.gpl`;
/** Aseprite sources and their PNG + JSON exports (Art Bible 11.2). */
export const CHARACTER_SOURCES = `${REPO_ROOT}art/source/characters`;
/** Generated runtime atlases; never edited by hand (Art Bible 11.2). */
export const SPRITE_OUTPUT = `${REPO_ROOT}client/public/assets/sprites`;

export function loadPalette(): PaletteColor[] {
  return parseGpl(readFileSync(PALETTE_GPL, 'utf8'));
}
