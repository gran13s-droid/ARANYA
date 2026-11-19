import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PLAYER_ANIMS, PLAYER_FRAME_PX } from '@aranya/shared';
import { loadAsepriteExport } from '../aseprite.ts';
import { buildAtlas } from '../buildAtlas.ts';
import { writePng } from '../image.ts';
import { convertPaintedSheet } from '../importPainted.ts';
import { CHARACTER_SOURCES, SPRITE_OUTPUT, loadPalette } from '../paths.ts';

/**
 * Builds runtime atlases for every character in art/source/characters.
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

const files = existsSync(CHARACTER_SOURCES) ? readdirSync(CHARACTER_SOURCES) : [];
const names = new Set(files.filter((f) => f.endsWith('.json') || f.endsWith('.aseprite')).map((f) => basename(f).replace(/\.(json|aseprite)$/, '')));
let failed = false;

for (const name of [...names].sort()) {
  const source = join(CHARACTER_SOURCES, `${name}.aseprite`);
  if (existsSync(source)) {
    if (aseprite) exportWithAseprite(aseprite, source, CHARACTER_SOURCES, name);
    else if (!existsSync(join(CHARACTER_SOURCES, `${name}.json`))) {
      console.error(`[build-sprites] ${name}: .aseprite found but Aseprite CLI is not available. Set ASEPRITE_PATH or export PNG + JSON manually.`);
      failed = true;
      continue;
    }
  }

  let sheet = loadAsepriteExport(join(CHARACTER_SOURCES, `${name}.json`), name);
  if (sheet.import) {
    console.warn(`[build-sprites] ${name}: converting a painted sheet to ${sheet.import.frameSize}px pixel frames (prototype only; final art must be drawn per Art Bible 2)`);
    sheet = convertPaintedSheet(sheet, palette);
  }
  const result = buildAtlas(sheet, { palette, frameSize: PLAYER_FRAME_PX, anims: PLAYER_ANIMS }, `${name}.png`, { maxWidth: 1024, maxHeight: 2048 });
  for (const issue of result.issues) console[issue.level === 'error' ? 'error' : 'warn'](`[build-sprites] ${name}: ${issue.level}: ${issue.message}`);
  if (!('json' in result)) {
    failed = true;
    continue;
  }
  writePng(join(SPRITE_OUTPUT, `${name}.png`), result.image);
  writeFileSync(join(SPRITE_OUTPUT, `${name}.json`), JSON.stringify(result.json));
  console.log(`[build-sprites] ${name}: ${sheet.frames.length} frames (${result.uniqueFrames} unique) -> ${result.image.width}x${result.image.height} atlas`);
}

if (names.size === 0) console.warn('[build-sprites] no character sources found');
if (failed) process.exit(1);
