import type { AtlasJson } from '@aranya/shared';

/** Base URL of atlases built by `pnpm assets` (tools/src/cli/buildSprites.ts). */
const SPRITES_URL = `${import.meta.env.BASE_URL}assets/sprites/`;

export async function loadAtlas(name: string): Promise<{ atlas: AtlasJson; imageUrl: string }> {
  const res = await fetch(`${SPRITES_URL}${name}.json`);
  if (!res.ok) throw new Error(`Atlas ${name} not found (${res.status}). Run \`pnpm assets\`.`);
  const atlas = (await res.json()) as AtlasJson;
  return { atlas, imageUrl: `${SPRITES_URL}${atlas.meta.image}` };
}
