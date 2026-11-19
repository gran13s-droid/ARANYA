import type { Vec3 } from '@aranya/shared';

/**
 * Ring buffer of recent positions for lag compensation: hits are tested
 * against where a target was when the attacker saw it (GDD/ROADMAP 1.2: ~100 ms rewind).
 */
export class PositionHistory {
  private readonly times: number[];
  private readonly positions: Vec3[];
  private head = 0;
  private size = 0;

  constructor(private readonly capacity = 40) {
    this.times = new Array<number>(capacity).fill(0);
    this.positions = Array.from({ length: capacity }, () => ({ x: 0, y: 0, z: 0 }));
  }

  push(time: number, pos: Vec3): void {
    this.times[this.head] = time;
    this.positions[this.head] = { x: pos.x, y: pos.y, z: pos.z };
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  /** Position at `time`, linearly interpolated; clamps to the oldest/newest sample. */
  at(time: number, fallback: Vec3): Vec3 {
    if (this.size === 0) return fallback;
    const idx = (k: number): number => (this.head - 1 - k + this.capacity * 2) % this.capacity;
    const newest = idx(0);
    if (time >= this.times[newest]!) return this.positions[newest]!;
    for (let k = 0; k < this.size - 1; k++) {
      const b = idx(k);
      const a = idx(k + 1);
      const ta = this.times[a]!;
      const tb = this.times[b]!;
      if (time >= ta && time <= tb) {
        const f = tb === ta ? 1 : (time - ta) / (tb - ta);
        const pa = this.positions[a]!;
        const pb = this.positions[b]!;
        return { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f, z: pa.z + (pb.z - pa.z) * f };
      }
    }
    return this.positions[idx(this.size - 1)]!;
  }
}
