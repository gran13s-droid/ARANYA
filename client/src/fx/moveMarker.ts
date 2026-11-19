import { Color3, MeshBuilder, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import type { Vec3 } from '@aranya/shared';
import { color } from '../palette.ts';

/** Shrinking gold ring on the ground where a click-to-move order is heading. */
export class MoveMarker {
  private readonly ring: Mesh;
  private age = 0;

  constructor(scene: Scene) {
    const mat = new StandardMaterial('moveMarkerMat', scene);
    mat.diffuseColor = Color3.FromHexString(color('GOLD').hex);
    mat.emissiveColor = mat.diffuseColor;
    mat.disableLighting = true;
    this.ring = MeshBuilder.CreateTorus('moveMarker', { diameter: 0.6, thickness: 0.05, tessellation: 16 }, scene);
    this.ring.material = mat;
    this.ring.isPickable = false;
    this.ring.renderingGroupId = 1;
    this.ring.setEnabled(false);
  }

  /** Shows the ring at `at` (null hides it); restarts the pulse when the point changes. */
  update(dtMs: number, at: Vec3 | null): void {
    if (!at) {
      this.ring.setEnabled(false);
      return;
    }
    const p = this.ring.position;
    if (!this.ring.isEnabled() || Math.hypot(p.x - at.x, p.z - at.z) > 0.05) this.age = 0;
    this.ring.setEnabled(true);
    p.set(at.x, at.y + 0.05, at.z);
    this.age += dtMs;
    const s = 1 - 0.35 * ((this.age % 600) / 600);
    this.ring.scaling.set(s, 1, s);
  }
}
