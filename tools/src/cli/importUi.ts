import { readFileSync, writeFileSync } from 'node:fs';
import type { UiAtlasJson } from '@aranya/shared';
import { readPng, writePng, type Image } from '../image.ts';
import { convertProp, packProps } from '../propImport.ts';
import { REPO_ROOT, UI_SOURCES, loadPalette } from '../paths.ts';

/**
 * Builds art/source/ui/ui_ref.{png,json} (UI frames) from the UI kit concept
 * listed in art/source/ui/ui.import.json. Prototype only (Art Bible 2); the
 * HUD falls back to its code-drawn frames (client/src/ui/pixelArt.ts) when
 * this atlas is missing. Run `pnpm assets` afterwards (or `pnpm dev`).
 */
interface UiSpec {
  name: string;
  source: string;
  rect: [number, number, number, number];
  /** Height in 640x360 UI pixels. */
  heightPx: number;
  /** Transparent round centre [cx, cy, r] as fractions of the output height (the portrait shows through). */
  hole?: [number, number, number];
  slice?: [number, number];
  inner?: [number, number, number, number];
}

const config = JSON.parse(readFileSync(`${UI_SOURCES}/ui.import.json`, 'utf8')) as { frames: UiSpec[] };
const palette = loadPalette();
const sheets = new Map<string, Image>();
const frames = new Map<string, Image>();
for (const spec of config.frames) {
  let sheet = sheets.get(spec.source);
  if (!sheet) sheets.set(spec.source, (sheet = readPng(`${REPO_ROOT}art/reference/concept/${spec.source}`)));
  const img = convertProp(sheet, { kind: spec.name, source: spec.source, rect: spec.rect, heightM: 1 }, palette, spec.heightPx);
  if (spec.hole) {
    const [cx, cy, r] = spec.hole;
    const h = img.height;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if ((x + 0.5 - cx * h) ** 2 + (y + 0.5 - cy * h) ** 2 <= (r * h) ** 2) img.data.set([0, 0, 0, 0], (y * img.width + x) * 4);
      }
    }
  }
  frames.set(spec.name, img);
  console.log(`[import-ui] ${spec.name}: ${img.width}x${img.height} UI px from ${spec.source}`);
}
const packed = packProps(frames, 'ui_ref.png', new Map(), 256);
const json: UiAtlasJson = { frames: {}, meta: { image: 'ui_ref.png', size: packed.json.meta.size, kind: 'ui' } };
for (const spec of config.frames) {
  const entry: UiAtlasJson['frames'][string] = { frame: packed.json.frames[spec.name]!.frame };
  if (spec.slice) entry.slice = spec.slice;
  if (spec.inner) entry.inner = spec.inner;
  json.frames[spec.name] = entry;
}
writePng(`${UI_SOURCES}/ui_ref.png`, packed.png);
writeFileSync(`${UI_SOURCES}/ui_ref.json`, JSON.stringify(json, null, 1) + '\n');
console.log(`[import-ui] ${frames.size} frames -> ${packed.png.width}x${packed.png.height} atlas art/source/ui/ui_ref.*`);
