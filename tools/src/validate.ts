import { DRAWN_DIRS, impactMs, tagName, type AnimSpec, type DrawnDir, type PaletteColor } from '@aranya/shared';
import type { SourceSheet } from './aseprite.ts';
import { pixel } from './image.ts';

export interface Issue {
  level: 'error' | 'warning';
  message: string;
}

export interface SpriteRules {
  palette: readonly PaletteColor[];
  /** Expected square frame size (Art Bible 4.2). */
  frameSize: number;
  anims: Readonly<Record<string, AnimSpec>>;
  dirs?: readonly DrawnDir[];
}

export interface ValidationResult {
  issues: Issue[];
  /** Ground point inside the frame, derived from the feet of grounded frames. */
  pivot: { x: number; y: number } | null;
}

const TAG_PATTERN = /^[a-z][a-z0-9]*_(S|E|N)$/;
const MAX_REPORTED_PIXELS = 3;

/**
 * Automated checks from the Art Bible 12 checklist (items marked 🤖):
 * palette, 1-bit alpha, frame size, tag naming, frame counts, impact timing
 * and a shared feet baseline for grounded animations.
 */
export function validateSheet(sheet: SourceSheet, rules: SpriteRules): ValidationResult {
  const issues: Issue[] = [];
  const error = (message: string): void => void issues.push({ level: 'error', message });
  const warn = (message: string): void => void issues.push({ level: 'warning', message });
  const dirs = rules.dirs ?? DRAWN_DIRS;

  const { w, h } = sheet.frameSize;
  if (w !== rules.frameSize || h !== rules.frameSize) {
    error(`frame size is ${w}x${h}, expected ${rules.frameSize}x${rules.frameSize} (Art Bible 4.2)`);
  }

  const paletteKeys = new Set(rules.palette.map((c) => (c.r << 16) | (c.g << 8) | c.b));
  const baselines: (number | null)[] = sheet.frames.map((frame, index) => {
    const img = frame.image;
    let offPalette = 0;
    let semiAlpha = 0;
    const samples: string[] = [];
    let lowest: number | null = null;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const [r, g, b, a] = pixel(img, x, y);
        if (a === 0) continue;
        if (a !== 255) {
          semiAlpha++;
          if (samples.length < MAX_REPORTED_PIXELS) samples.push(`alpha ${a} at (${x},${y})`);
          continue;
        }
        lowest = y;
        if (!paletteKeys.has((r << 16) | (g << 8) | b)) {
          offPalette++;
          if (samples.length < MAX_REPORTED_PIXELS) {
            samples.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')} at (${x},${y})`);
          }
        }
      }
    }
    if (lowest === null) error(`frame ${index} is empty`);
    if (offPalette > 0) error(`frame ${index}: ${offPalette} pixel(s) outside the 15-color palette, e.g. ${samples.join(', ')}`);
    if (semiAlpha > 0) error(`frame ${index}: ${semiAlpha} semi-transparent pixel(s); sprites use alpha 0 or 255 only`);
    return lowest;
  });

  const tagsByName = new Map(sheet.tags.map((t) => [t.name, t]));
  for (const tag of sheet.tags) {
    if (!TAG_PATTERN.test(tag.name)) error(`tag "${tag.name}" must be named <anim>_<S|E|N> (Art Bible 11.2)`);
    if (tag.direction && tag.direction !== 'forward') error(`tag "${tag.name}" must play forward, not ${tag.direction}`);
    if (tag.to < tag.from || tag.to >= sheet.frames.length) error(`tag "${tag.name}" has an invalid frame range`);
  }

  const groundedBaselines = new Set<number>();
  for (const [anim, spec] of Object.entries(rules.anims)) {
    for (const dir of dirs) {
      const name = tagName(anim, dir);
      const tag = tagsByName.get(name);
      if (!tag) {
        error(`missing tag "${name}"`);
        continue;
      }
      const count = tag.to - tag.from + 1;
      if (count !== spec.frames) error(`tag "${name}" has ${count} frame(s), Art Bible 5.2 says ${spec.frames}`);

      const durations = sheet.frames.slice(tag.from, tag.to + 1).map((f) => f.durationMs);
      const total = durations.reduce((a, b) => a + b, 0);
      if (Math.abs(total - spec.durationMs) > spec.durationMs * 0.1) {
        warn(`tag "${name}" lasts ${total} ms, Art Bible 5.2 says ${spec.durationMs} ms`);
      }
      const expectedImpact = impactMs(spec);
      if (expectedImpact !== null && spec.impactFrame !== undefined) {
        const actual = durations.slice(0, spec.impactFrame - 1).reduce((a, b) => a + b, 0);
        if (Math.abs(actual - expectedImpact) > 5) {
          error(`tag "${name}" reaches its impact frame at ${actual} ms but the server uses ${expectedImpact} ms (impactMs)`);
        }
      }
      if (spec.grounded) {
        for (let i = tag.from; i <= tag.to; i++) {
          const b = baselines[i];
          if (b !== null && b !== undefined) groundedBaselines.add(b);
        }
      }
    }
  }

  const expectedTags = new Set(Object.keys(rules.anims).flatMap((a) => dirs.map((d) => tagName(a, d))));
  for (const tag of sheet.tags) {
    if (TAG_PATTERN.test(tag.name) && !expectedTags.has(tag.name)) warn(`tag "${tag.name}" is not in the animation spec and will be packed as-is`);
  }

  let pivot: ValidationResult['pivot'] = null;
  if (groundedBaselines.size > 1) {
    error(`feet are not on one baseline in grounded animations (rows ${[...groundedBaselines].sort((a, b) => a - b).join(', ')})`);
  } else if (groundedBaselines.size === 1) {
    pivot = { x: w / 2, y: [...groundedBaselines][0]! + 1 };
  }

  return { issues, pivot };
}
