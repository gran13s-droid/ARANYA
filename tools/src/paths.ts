import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGpl, type PaletteColor } from '@aranya/shared';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PALETTE_GPL = `${REPO_ROOT}art/palette/aranya-15.gpl`;
/** Aseprite sources and their PNG + JSON exports (Art Bible 11.2). */
export const CHARACTER_SOURCES = `${REPO_ROOT}art/source/characters`;
/** Prop billboards cut from concept sheets: props.import.json -> props_ref.{png,json} (import-props). */
export const PROP_SOURCES = `${REPO_ROOT}art/source/props`;
/** UI frames cut from the UI kit concept: ui.import.json -> ui_ref.{png,json} (import-ui). */
export const UI_SOURCES = `${REPO_ROOT}art/source/ui`;
/** Monster sources: mon_<species>.{aseprite | png + json}, and <species>_ai/ sheets for import-monster. */
export const MONSTER_SOURCES = `${REPO_ROOT}art/source/monsters`;
/** Generated runtime atlases; never edited by hand (Art Bible 11.2). */
export const SPRITE_OUTPUT = `${REPO_ROOT}client/public/assets/sprites`;

export function loadPalette(): PaletteColor[] {
  return parseGpl(readFileSync(PALETTE_GPL, 'utf8'));
}
