import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crop, readPng, type Image } from './image.ts';

/** Subset of the JSON written by `aseprite -b --data` (json-hash or json-array). */
export interface AseFrameJson {
  filename?: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated?: boolean;
  trimmed?: boolean;
  sourceSize?: { w: number; h: number };
  duration: number;
}

export interface AseTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
}

/**
 * Our extension to the Aseprite JSON: marks a painted (non pixel-art) sheet
 * that the pipeline converts to compliant 64x64 pixel frames at build time.
 * Prototype use only: Art Bible 2 does not allow AI/painted art as final assets.
 */
export interface ImportOptions {
  /** Target frame size in pixels (e.g. 64). */
  frameSize: number;
  /** Character height after conversion in pixels (Art Bible 4.2: 44-48 for players). */
  targetHeight: number;
  /** Source height (px) that maps to targetHeight; one scale for every frame keeps sizes consistent. */
  sourceHeight: number;
  /** Alpha (0-255) at or above which a converted pixel becomes opaque. */
  alphaThreshold?: number;
  /** Add the 1 px INK outline (Art Bible 6.1). */
  outline?: boolean;
  /** 'mode' (default): most common palette color per pixel; 'average': blend then snap. */
  downsample?: 'mode' | 'average';
  /** Opaque islands smaller than this are removed (default 8 px). */
  minIslandPx?: number;
  /** Palette colors (by name) to delete after conversion, e.g. FIRE hit marks on a monster that has no red. */
  dropColors?: string[];
}

export interface AseJson {
  frames: AseFrameJson[] | Record<string, AseFrameJson>;
  meta: { app?: string; image: string; size: { w: number; h: number }; frameTags?: AseTag[]; import?: ImportOptions };
}

export interface SourceFrame {
  image: Image;
  durationMs: number;
}

/** One exported Aseprite file: frames in timeline order plus its tags. */
export interface SourceSheet {
  name: string;
  frames: SourceFrame[];
  tags: AseTag[];
  frameSize: { w: number; h: number };
  /** Present when the JSON asks for painted-sheet conversion. */
  import?: ImportOptions;
}

export function parseAsepriteJson(json: AseJson): { frames: AseFrameJson[]; tags: AseTag[]; image: string } {
  const frames = Array.isArray(json.frames) ? json.frames : Object.values(json.frames);
  return { frames, tags: json.meta.frameTags ?? [], image: json.meta.image };
}

/**
 * Loads an Aseprite PNG + JSON export. Trimmed or rotated frames are rejected:
 * export with `--sheet-type packed` but without `--trim`, so every frame keeps
 * the same canvas and the bottom-center pivot stays meaningful.
 */
export function loadAsepriteExport(jsonPath: string, name: string): SourceSheet {
  const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as AseJson;
  const { frames, tags, image } = parseAsepriteJson(json);
  if (frames.length === 0) throw new Error(`${jsonPath}: no frames`);

  const sheet = readPng(join(dirname(jsonPath), image));
  const first = frames[0]!.frame;
  const out: SourceFrame[] = frames.map((f, i) => {
    if (f.rotated) throw new Error(`${jsonPath}: frame ${i} is rotated; disable rotation on export`);
    if (f.trimmed) throw new Error(`${jsonPath}: frame ${i} is trimmed; export without --trim`);
    if (f.frame.w !== first.w || f.frame.h !== first.h) {
      throw new Error(`${jsonPath}: frame ${i} is ${f.frame.w}x${f.frame.h}, expected ${first.w}x${first.h}`);
    }
    return { image: crop(sheet, f.frame.x, f.frame.y, f.frame.w, f.frame.h), durationMs: f.duration };
  });
  const sheetOut: SourceSheet = { name, frames: out, tags, frameSize: { w: first.w, h: first.h } };
  if (json.meta.import) sheetOut.import = json.meta.import;
  return sheetOut;
}
