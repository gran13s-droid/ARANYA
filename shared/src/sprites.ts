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
