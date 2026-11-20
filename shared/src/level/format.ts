import type { LevelFile } from './types.ts';

/**
 * Stable text form of a level file: one array item per line, so diffs of
 * editor saves show exactly which props or spawns moved.
 */
export function formatLevelFile(file: LevelFile): string {
  const lines = Object.entries(file).map(([key, value]) => {
    if (!Array.isArray(value)) return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    if (value.length === 0) return `  ${JSON.stringify(key)}: []`;
    return `  ${JSON.stringify(key)}: [\n${value.map((v) => `    ${JSON.stringify(v)}`).join(',\n')}\n  ]`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}
