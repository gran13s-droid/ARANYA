import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PLAYER_ANIMS, type PlayerAnim } from '@aranya/shared';
import { importHero, type DirectionSheet, type HeroSheets } from '../heroImport.ts';
import { readPng, writePng } from '../image.ts';
import { CHARACTER_SOURCES, loadPalette } from '../paths.ts';

/**
 * Builds art/source/characters/chr_placeholder.{png,json} from the per-direction
 * sheets in art/source/characters/hero_ai/hero_{S,E,N}.png (6 columns, one row per
 * animation; see tools/src/heroImport.ts). If a sheet skipped or reordered rows,
 * put its row order in hero_<dir>.rows.json, e.g. ["idle","walk",...]; missing
 * animations then use the E sheet. Run `pnpm assets` afterwards (or `pnpm dev`).
 */
const dir = `${CHARACTER_SOURCES}/hero_ai`;

function load(d: 'S' | 'E' | 'N'): DirectionSheet | undefined {
  const png = `${dir}/hero_${d}.png`;
  if (!existsSync(png)) return undefined;
  const sheet: DirectionSheet = { image: readPng(png) };
  const rowsFile = `${dir}/hero_${d}.rows.json`;
  if (existsSync(rowsFile)) {
    const rows = JSON.parse(readFileSync(rowsFile, 'utf8')) as unknown;
    if (!Array.isArray(rows) || !rows.every((r) => typeof r === 'string' && r in PLAYER_ANIMS)) {
      throw new Error(`${rowsFile} must be an array of: ${Object.keys(PLAYER_ANIMS).join(', ')}`);
    }
    sheet.rows = rows as PlayerAnim[];
  }
  return sheet;
}

const east = load('E');
if (!east) {
  console.error(`[import-hero] missing ${dir}/hero_E.png`);
  process.exit(1);
}
const sheets: HeroSheets = { E: east };
const south = load('S');
const north = load('N');
if (south) sheets.S = south;
if (north) sheets.N = north;

const { png, json, fallbacks, sourceHeight, suspicious } = importHero(sheets, loadPalette());
writePng(`${CHARACTER_SOURCES}/chr_placeholder.png`, png);
writeFileSync(`${CHARACTER_SOURCES}/chr_placeholder.json`, JSON.stringify(json, null, 1) + '\n');
console.log(`[import-hero] idle height ${sourceHeight}px -> 46px, ${json.meta.frameTags?.length} tags -> art/source/characters/chr_placeholder.*`);
if (fallbacks.length) console.warn(`[import-hero] using the E sheet for: ${fallbacks.join(', ')}`);
for (const [d, cells] of Object.entries(suspicious)) {
  console.warn(`[import-hero] ${d}: content touches a cut edge in cells (row:col) ${cells.join(', ')} - check that sheet's row count/order`);
}
