import type { Vec3 } from '@aranya/shared';

interface Snapshot {
  time: number;
  pos: Vec3;
}

/**
 * Snapshot buffer for remote players. Rendering runs a fixed delay behind
 * real time (INTERPOLATION_DELAY_MS), so there are normally two snapshots
 * around the render time and movement looks smooth at 60 fps despite 20 Hz updates.
 */
export class InterpolationBuffer {
  private readonly snapshots: Snapshot[] = [];

  constructor(private readonly maxSnapshots = 20) {}

  push(time: number, pos: Vec3): void {
    this.snapshots.push({ time, pos: { ...pos } });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  sample(renderTime: number): Vec3 | null {
    const s = this.snapshots;
    if (s.length === 0) return null;
    const first = s[0]!;
    if (renderTime <= first.time) return first.pos;
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (renderTime >= a.time && renderTime <= b.time) {
        const k = b.time === a.time ? 1 : (renderTime - a.time) / (b.time - a.time);
        return {
          x: a.pos.x + (b.pos.x - a.pos.x) * k,
          y: a.pos.y + (b.pos.y - a.pos.y) * k,
          z: a.pos.z + (b.pos.z - a.pos.z) * k,
        };
      }
    }
    // Render time is past the newest snapshot: hold the last known position (no extrapolation).
    return s[s.length - 1]!.pos;
  }
}
