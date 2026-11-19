import type { AtlasAnimation, AtlasJson } from '@aranya/shared';
import type { SourceSheet } from './aseprite.ts';
import type { Image } from './image.ts';
import { packFrames, type PackOptions } from './pack.ts';
import { validateSheet, type Issue, type SpriteRules } from './validate.ts';

export interface BuiltAtlas {
  image: Image;
  json: AtlasJson;
  issues: Issue[];
  uniqueFrames: number;
}

/** Validates a sheet and, if it has no errors, packs it into the runtime atlas format. */
export function buildAtlas(sheet: SourceSheet, rules: SpriteRules, imageFile: string, pack: PackOptions = {}): BuiltAtlas | { issues: Issue[] } {
  const { issues, pivot } = validateSheet(sheet, rules);
  if (issues.some((i) => i.level === 'error')) return { issues };

  const keyed: { key: string; image: Image }[] = [];
  const animations: Record<string, AtlasAnimation> = {};
  for (const tag of sheet.tags) {
    const anim = tag.name.replace(/_(S|E|N)$/, '');
    const spec = rules.anims[anim];
    const keys: string[] = [];
    const durations: number[] = [];
    for (let i = tag.from; i <= tag.to; i++) {
      const key = `${tag.name}_${i - tag.from}`;
      keyed.push({ key, image: sheet.frames[i]!.image });
      keys.push(key);
      durations.push(sheet.frames[i]!.durationMs);
    }
    animations[tag.name] = { frames: keys, durations, loop: spec?.loop ?? false, holdLast: spec?.holdLast ?? false };
  }

  const { atlas, rects, uniqueFrames } = packFrames(keyed, pack);
  const frames: AtlasJson['frames'] = {};
  for (const [key, rect] of rects) frames[key] = { frame: rect };

  const { w, h } = sheet.frameSize;
  return {
    image: atlas,
    uniqueFrames,
    issues,
    json: {
      frames,
      animations,
      meta: {
        image: imageFile,
        size: { w: atlas.width, h: atlas.height },
        frameSize: { w, h },
        pivot: pivot ?? { x: w / 2, y: h },
      },
    },
  };
}
