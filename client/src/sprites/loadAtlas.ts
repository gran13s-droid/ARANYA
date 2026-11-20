import type { AtlasIndex, AtlasJson, PropAtlasJson, UiAtlasJson } from '@aranya/shared';

/** Base URL of atlases built by `pnpm assets` (tools/src/cli/buildSprites.ts). */
const SPRITES_URL = `${import.meta.env.BASE_URL}assets/sprites/`;

/** Names of the atlases that exist (written by build-sprites). */
export async function listAtlases(): Promise<Set<string>> {
  const res = await fetch(`${SPRITES_URL}index.json`);
  if (!res.ok) return new Set();
  return new Set(((await res.json()) as AtlasIndex).atlases);
}

export async function loadAtlas(name: string): Promise<{ atlas: AtlasJson; imageUrl: string }> {
  const res = await fetch(`${SPRITES_URL}${name}.json`);
  if (!res.ok) throw new Error(`Atlas ${name} not found (${res.status}). Run \`pnpm assets\`.`);
  const atlas = (await res.json()) as AtlasJson;
  return { atlas, imageUrl: `${SPRITES_URL}${atlas.meta.image}` };
}

/** Prop billboard atlas built by import-props (art/source/props). */
export async function loadPropAtlas(name: string): Promise<{ atlas: PropAtlasJson; imageUrl: string }> {
  const res = await fetch(`${SPRITES_URL}${name}.json`);
  if (!res.ok) throw new Error(`Prop atlas ${name} not found (${res.status}). Run pnpm assets.`);
  const atlas = (await res.json()) as PropAtlasJson;
  return { atlas, imageUrl: `${SPRITES_URL}${atlas.meta.image}` };
}

/** UI frame atlas built by import-ui (art/source/ui), with its image decoded so the HUD can draw from it. */
export async function loadUiAtlas(name: string): Promise<{ atlas: UiAtlasJson; image: HTMLImageElement }> {
  const res = await fetch(`${SPRITES_URL}${name}.json`);
  if (!res.ok) throw new Error(`UI atlas ${name} not found (${res.status}). Run pnpm assets.`);
  const atlas = (await res.json()) as UiAtlasJson;
  const image = new Image();
  image.src = `${SPRITES_URL}${atlas.meta.image}`;
  await image.decode();
  return { atlas, image };
}
