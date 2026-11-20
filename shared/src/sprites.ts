/**
 * Runtime atlas format written by /tools (build-sprites) and read by the client.
 * `frames` follows the TexturePacker "hash" shape so Babylon's packed
 * SpriteManager can consume it directly; the other fields are ours.
 */
export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasAnimation {
  /** Frame keys in play order. */
  frames: string[];
  /** Per-frame durations in ms (from the Aseprite export). */
  durations: number[];
  loop: boolean;
  holdLast: boolean;
}

/** `assets/sprites/index.json`: atlases the last `pnpm assets` built, so the client never requests a missing one. */
export interface AtlasIndex {
  atlases: string[];
}

export interface AtlasJson {
  frames: Record<string, { frame: AtlasRect }>;
  /** Keyed by tag name, e.g. `run_S`. */
  animations: Record<string, AtlasAnimation>;
  meta: {
    image: string;
    size: { w: number; h: number };
    /** Size of one source frame in pixels. */
    frameSize: { w: number; h: number };
    /** Ground contact point inside a frame, from the top-left (Art Bible 4.1: bottom-center). */
    pivot: { x: number; y: number };
  };
}

/**
 * Prop billboard atlas (`import-props`): one frame per prop kind, any size,
 * drawn standing on its bottom-centre pixel at 32 px = 1 m. Prototype art cut
 * from the concept sheets (Art Bible 2: reference only; final props are 3D).
 */
/**
 * UI frame atlas (`import-ui`): frames cut from the UI kit concept (prototype,
 * Art Bible 2) at 640x360 UI pixel size. `slice` = left/right cap widths as
 * fractions of the frame width (3-slice for bars), `inner` = [left, top,
 * right, bottom] fractions where a fill goes, `hole` = [cx, cy, r] fractions of
 * the height for a transparent round centre (portrait rings).
 */
export interface UiAtlasJson {
  frames: Record<string, { frame: AtlasRect; slice?: [number, number]; inner?: [number, number, number, number]; hole?: [number, number, number] }>;
  meta: { image: string; size: { w: number; h: number }; kind: 'ui' };
}

export interface PropAtlasJson {
  /** offsetZ: metres south (towards the camera) of the prop's position where the picture's bottom stands. */
  frames: Record<string, { frame: AtlasRect; offsetZ?: number }>;
  meta: { image: string; size: { w: number; h: number }; kind: 'props' };
}
