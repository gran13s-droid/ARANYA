import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGpl } from './palette.ts';

const gpl = readFileSync(new URL('../../art/palette/aranya-15.gpl', import.meta.url), 'utf8');
const hex = readFileSync(new URL('../../art/palette/aranya-15.hex', import.meta.url), 'utf8');

describe('palette', () => {
  const colors = parseGpl(gpl);

  it('has 15 colors in index order 1..15', () => {
    expect(colors.map((c) => c.index)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('matches the .hex export exactly', () => {
    const hexLines = hex.trim().split(/\r?\n/).map((l) => '#' + l.trim().toLowerCase());
    expect(colors.map((c) => c.hex)).toEqual(hexLines);
  });

  it('keeps reserved colors at their indices', () => {
    expect(colors[6]?.name).toBe('SPIRIT');
    expect(colors[13]?.name).toBe('PURPLE_DEEP');
    expect(colors[14]?.name).toBe('CURSE');
  });
});
