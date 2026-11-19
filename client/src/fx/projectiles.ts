import { Color3, MeshBuilder, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import type { ProjectileEndEvent, ProjectileEvent } from '@aranya/shared';
import { color } from '../palette.ts';

interface Flying {
  mesh: Mesh;
  vx: number;
  vz: number;
  left: number;
}

/**
 * Enemy projectiles (Lost Mom's jade orb). Purely visual: the client flies the
 * orb from the server's spawn event; hits are decided by the server's swept test.
 */
export class Projectiles {
  private readonly flying = new Map<number, Flying>();
  private readonly mat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.mat = new StandardMaterial('projectileMat', scene);
    this.mat.diffuseColor = Color3.FromHexString(color('SPIRIT').hex);
    this.mat.emissiveColor = this.mat.diffuseColor;
    this.mat.disableLighting = true;
  }

  spawn(evt: ProjectileEvent): void {
    const mesh = MeshBuilder.CreateIcoSphere(`orb_${evt.id}`, { radius: 0.22, subdivisions: 1 }, this.scene);
    mesh.material = this.mat;
    mesh.isPickable = false;
    mesh.position.set(evt.x, evt.y + 0.7, evt.z);
    this.flying.set(evt.id, { mesh, vx: evt.vx, vz: evt.vz, left: evt.range });
  }

  end(evt: ProjectileEndEvent): void {
    const f = this.flying.get(evt.id);
    if (!f) return;
    f.mesh.dispose();
    this.flying.delete(evt.id);
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const [id, f] of this.flying) {
      const step = Math.hypot(f.vx, f.vz) * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.z += f.vz * dt;
      f.mesh.rotation.y += dt * 6;
      f.left -= step;
      if (f.left <= -1) {
        f.mesh.dispose();
        this.flying.delete(id);
      }
    }
  }

  get count(): number {
    return this.flying.size;
  }
}
