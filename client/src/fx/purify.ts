import { Color3, MeshBuilder, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import type { Vec3 } from '@aranya/shared';
import { color } from '../palette.ts';

const LIFETIME_MS = 600;

/**
 * Monster defeated = purified, not destroyed (GDD pillar 1): a SPIRIT ring
 * expands and fades where it stood. Placeholder for the real VFX (V-14).
 */
export class PurifyBursts {
  private readonly active: { mesh: Mesh; age: number }[] = [];
  private readonly mat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.mat = new StandardMaterial('purifyMat', scene);
    this.mat.diffuseColor = Color3.FromHexString(color('SPIRIT').hex);
    this.mat.emissiveColor = this.mat.diffuseColor;
    this.mat.disableLighting = true;
  }

  show(at: Vec3): void {
    const mesh = MeshBuilder.CreateTorus('purify', { diameter: 1, thickness: 0.1, tessellation: 24 }, this.scene);
    mesh.material = this.mat.clone('purifyMatInst');
    mesh.isPickable = false;
    mesh.position.set(at.x, at.y + 0.3, at.z);
    this.active.push({ mesh, age: 0 });
  }

  update(dtMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i]!;
      a.age += dtMs;
      const k = a.age / LIFETIME_MS;
      if (k >= 1) {
        a.mesh.material?.dispose();
        a.mesh.dispose();
        this.active.splice(i, 1);
        continue;
      }
      a.mesh.scaling.setAll(1 + k * 2);
      a.mesh.position.y += dtMs * 0.001;
      if (a.mesh.material) a.mesh.material.alpha = 1 - k;
    }
  }
}
