import { mkdirSync, writeFileSync } from 'node:fs';
import { writePng } from '../image.ts';
import { CHARACTER_SOURCES, loadPalette } from '../paths.ts';
import { generatePlaceholder } from '../placeholder.ts';

/** Regenerates art/source/characters/chr_placeholder.{png,json}. */
const { png, json, sheet } = generatePlaceholder(loadPalette());
mkdirSync(CHARACTER_SOURCES, { recursive: true });
writePng(`${CHARACTER_SOURCES}/${sheet.name}.png`, png);
writeFileSync(`${CHARACTER_SOURCES}/${sheet.name}.json`, JSON.stringify(json, null, 1) + '\n');
console.log(`[gen-placeholder] ${sheet.frames.length} frames, ${sheet.tags.length} tags -> art/source/characters/${sheet.name}.*`);
