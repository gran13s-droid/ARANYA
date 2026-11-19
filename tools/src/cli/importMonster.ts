import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DRAWN_DIRS, MONSTER_ANIMS, monsterAtlasName, type DrawnDir } from '@aranya/shared';
import { readPng, writePng, type Image } from '../image.ts';
import { importMonster, type MonsterImportConfig } from '../monsterImport.ts';
import { MONSTER_SOURCES, loadPalette } from '../paths.ts';

/**
 * Builds art/source/monsters/mon_<species>.{png,json} from the AI sheets in
 * art/source/monsters/<species>_ai/<species>_{S,E,N}.png (5 columns, one row per
 * animation: idle, move, attack, hit, death; see tools/src/monsterImport.ts).
 * Options live in <species>_ai/<species>.import.json (MonsterImportConfig).
 * Usage: import-monster [species...] (default: every *_ai folder).
 * Run `pnpm assets` afterwards (or `pnpm dev`).
 */
const requested = process.argv.slice(2);
const folders = existsSync(MONSTER_SOURCES) ? readdirSync(MONSTER_SOURCES).filter((f) => f.endsWith('_ai')) : [];
const species = requested.length ? requested : folders.map((f) => f.replace(/_ai$/, ''));
if (species.length === 0) {
  console.error(`[import-monster] no <species>_ai folders in ${MONSTER_SOURCES}`);
  process.exit(1);
}

const palette = loadPalette();
let failed = false;
for (const id of species) {
  const dir = `${MONSTER_SOURCES}/${id}_ai`;
  const sheets: Partial<Record<DrawnDir, Image>> = {};
  for (const d of DRAWN_DIRS) {
    const png = `${dir}/${id}_${d}.png`;
    if (existsSync(png)) sheets[d] = readPng(png);
  }
  const configFile = `${dir}/${id}.import.json`;
  const config: MonsterImportConfig = existsSync(configFile) ? (JSON.parse(readFileSync(configFile, 'utf8')) as MonsterImportConfig) : { targetHeight: 30 };
  for (const rows of Object.values(config.rows ?? {})) {
    if (!rows.every((r) => r === null || r in MONSTER_ANIMS)) {
      console.error(`[import-monster] ${configFile}: rows must be ${Object.keys(MONSTER_ANIMS).join(', ')} or null`);
      process.exit(1);
    }
  }
  const name = monsterAtlasName(id);
  try {
    const { png, json, fallbacks, sourceHeights } = importMonster(sheets, config, palette, name);
    writePng(`${MONSTER_SOURCES}/${name}.png`, png);
    writeFileSync(`${MONSTER_SOURCES}/${name}.json`, JSON.stringify(json, null, 1) + '\n');
    const heights = Object.entries(sourceHeights).map(([d, h]) => `${d} ${h}px`).join(', ');
    console.log(`[import-monster] ${id}: idle height ${heights} -> ${config.targetHeight}px, ${json.meta.frameTags?.length} tags -> art/source/monsters/${name}.*`);
    if (fallbacks.length) console.warn(`[import-monster] ${id}: reused sheets ${fallbacks.join(', ')}`);
  } catch (e) {
    console.error(`[import-monster] ${id}: ${(e as Error).message}`);
    failed = true;
  }
}
if (failed) process.exit(1);
