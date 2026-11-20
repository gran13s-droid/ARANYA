import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MONSTER_ANIMS, MONSTER_FRAME_PX, PLAYER_ANIMS, PLAYER_FRAME_PX, type AnimSpec, type AtlasIndex } from '@aranya/shared';
import { loadAsepriteExport } from '../aseprite.ts';
import { buildAtlas } from '../buildAtlas.ts';
import { writePng } from '../image.ts';
import { convertPaintedSheet } from '../importPainted.ts';
import { CHARACTER_SOURCES, MONSTER_SOURCES, PROP_SOURCES, SPRITE_OUTPUT, UI_SOURCES, loadPalette } from '../paths.ts';

/**
 * Builds runtime atlases for every character in art/source/characters (64 px,
 * PLAYER_ANIMS) and every monster in art/source/monsters (48 px, MONSTER_ANIMS).
 *
 * - `<name>.aseprite` is exported with the Aseprite CLI first when it is
 *   available (ASEPRITE_PATH or `aseprite` on PATH).
 * - Otherwise an existing `<name>.png` + `<name>.json` export is used.
 * Exits with code 1 if any sheet fails the Art Bible checks.
 */

function asepriteBinary(): string | null {
  const candidates = [process.env.ASEPRITE_PATH, 'aseprite'].filter((c): c is string => !!c);
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return bin;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function exportWithAseprite(bin: string, source: string, outDir: string, name: string): void {
  execFileSync(bin, [
    '-b', source,
    '--sheet', join(outDir, `${name}.png`),
    '--data', join(outDir, `${name}.json`),
    '--format', 'json-hash',
    '--list-tags',
    '--sheet-type', 'rows',
  ], { stdio: 'inherit' });
}

const palette = loadPalette();
const aseprite = asepriteBinary();
mkdirSync(SPRITE_OUTPUT, { recursive: true });

/** Source folders and the Art Bible rules their sheets are checked against. */
const GROUPS: { dir: string; frameSize: number; anims: Readonly<Record<string, AnimSpec>> }[] = [
  { dir: CHARACTER_SOURCES, frameSize: PLAYER_FRAME_PX, anims: PLAYER_ANIMS },
  { dir: MONSTER_SOURCES, frameSize: MONSTER_FRAME_PX, anims: MONSTER_ANIMS },
];

let failed = false;
let built = 0;
const index: AtlasIndex = { atlases: [] };

for (const { dir, frameSize, anims } of GROUPS) {
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const names = new Set(files.filter((f) => f.endsWith('.json') || f.endsWith('.aseprite')).map((f) => basename(f).replace(/\.(json|aseprite)$/, '')));

  for (const name of [...names].sort()) {
    built++;
    const source = join(dir, `${name}.aseprite`);
    if (existsSync(source)) {
      if (aseprite) exportWithAseprite(aseprite, source, dir, name);
      else if (!existsSync(join(dir, `${name}.json`))) {
        console.error(`[build-sprites] ${name}: .aseprite found but Aseprite CLI is not available. Set ASEPRITE_PATH or export PNG + JSON manually.`);
        failed = true;
        continue;
      }
    }

    let sheet = loadAsepriteExport(join(dir, `${name}.json`), name);
    if (sheet.import) {
      console.warn(`[build-sprites] ${name}: converting a painted sheet to ${sheet.import.frameSize}px pixel frames (prototype only; final art must be drawn per Art Bible 2)`);
      sheet = convertPaintedSheet(sheet, palette);
    }
    const result = buildAtlas(sheet, { palette, frameSize, anims }, `${name}.png`, { maxWidth: 1024, maxHeight: 2048 });
    for (const issue of result.issues) console[issue.level === 'error' ? 'error' : 'warn'](`[build-sprites] ${name}: ${issue.level}: ${issue.message}`);
    if (!('json' in result)) {
      failed = true;
      continue;
    }
    writePng(join(SPRITE_OUTPUT, `${name}.png`), result.image);
    writeFileSync(join(SPRITE_OUTPUT, `${name}.json`), JSON.stringify(result.json));
    index.atlases.push(name);
    console.log(`[build-sprites] ${name}: ${sheet.frames.length} frames (${result.uniqueFrames} unique) -> ${result.image.width}x${result.image.height} atlas`);
  }
}

// Prop billboard and UI atlases (import-props, import-ui) are copied as they are.
for (const [dir, f] of [PROP_SOURCES, UI_SOURCES].flatMap((d) => (existsSync(d) ? readdirSync(d) : []).map((f) => [d, f] as const))) {
  if (!f.endsWith('.json') || f.endsWith('.import.json')) continue;
  const name = basename(f, '.json');
  const json = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { meta?: { kind?: string; image?: string } };
  if ((json.meta?.kind !== 'props' && json.meta?.kind !== 'ui') || !json.meta.image) continue;
  copyFileSync(join(dir, json.meta.image), join(SPRITE_OUTPUT, json.meta.image));
  writeFileSync(join(SPRITE_OUTPUT, f), JSON.stringify(json));
  index.atlases.push(name);
  built++;
  console.log(`[build-sprites] ${name}: ${json.meta.kind} atlas copied`);
}

writeFileSync(join(SPRITE_OUTPUT, 'index.json'), JSON.stringify(index));
if (built === 0) console.warn('[build-sprites] no character or monster sources found');
if (failed) process.exit(1);
