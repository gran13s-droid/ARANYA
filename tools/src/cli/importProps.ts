import { readFileSync, writeFileSync } from 'node:fs';
import { readPng, writePng, type Image } from '../image.ts';
import { convertProp, packProps, validateConfig, type PropImportConfig } from '../propImport.ts';
import { PROP_SOURCES, REPO_ROOT, loadPalette } from '../paths.ts';

/**
 * Builds art/source/props/props_ref.{png,json} (prop billboards) from the
 * concept sheets listed in art/source/props/props.import.json. Prototype only
 * (Art Bible 2); prop kinds not listed keep their greybox 3D model.
 * Run `pnpm assets` afterwards (or `pnpm dev`).
 */
const config = JSON.parse(readFileSync(`${PROP_SOURCES}/props.import.json`, 'utf8')) as PropImportConfig;
const problems = validateConfig(config);
if (problems.length) {
  console.error(`[import-props] ${problems.join('; ')}`);
  process.exit(1);
}
const palette = loadPalette();
const sheets = new Map<string, Image>();
const frames = new Map<string, Image>();
for (const spec of config.sprites) {
  let sheet = sheets.get(spec.source);
  if (!sheet) sheets.set(spec.source, (sheet = readPng(`${REPO_ROOT}art/reference/concept/${spec.source}`)));
  const img = convertProp(sheet, spec, palette);
  frames.set(spec.kind, img);
  console.log(`[import-props] ${spec.kind}: ${img.width}x${img.height} px (${spec.heightM} m) from ${spec.source}`);
}
const offsets = new Map(config.sprites.filter((s) => s.offsetZ).map((s) => [s.kind, s.offsetZ!]));
const { png, json } = packProps(frames, 'props_ref.png', offsets);
writePng(`${PROP_SOURCES}/props_ref.png`, png);
writeFileSync(`${PROP_SOURCES}/props_ref.json`, JSON.stringify(json, null, 1) + '\n');
console.log(`[import-props] ${frames.size} props -> ${png.width}x${png.height} atlas art/source/props/props_ref.*`);
