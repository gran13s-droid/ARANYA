import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, type Scene } from '@babylonjs/core';
import type { Element } from '@aranya/shared';
import { color, type PaletteName } from '../palette.ts';

/** Synced dummy fields (server/src/state.ts TargetState). */
export interface NetTarget {
  kind: string;
  element: string;
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
  hp: number;
  maxHp: number;
  stunned: boolean;
}

/** Element colors (Art Bible 8.2 LUT base colors). */
const ELEMENT_COLOR: Record<Element, PaletteName> = { fire: 'FIRE', smoke: 'STONE', jade: 'JADE', dark: 'CURSE' };

interface Visual {
  root: TransformNode;
  body: TransformNode;
  barFill: Mesh;
}

/**
 * Low-poly straw training dummies (หุ่นฟาง) with an element ring and an HP bar.
 * Placeholder visuals until monsters exist (Step 1.3).
 */
export class TargetViews {
  private readonly visuals = new Map<string, Visual>();
  private readonly mats = new Map<string, StandardMaterial>();

  constructor(private readonly scene: Scene) {}

  private mat(name: PaletteName, unlit = false): StandardMaterial {
    const key = `${name}:${unlit}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new StandardMaterial(`target_${key}`, this.scene);
      m.diffuseColor = Color3.FromHexString(color(name).hex);
      m.specularColor = Color3.Black();
      if (unlit) {
        m.disableLighting = true;
        m.emissiveColor = m.diffuseColor;
      }
      this.mats.set(key, m);
    }
    return m;
  }

  private create(id: string, t: NetTarget): Visual {
    const s = this.scene;
    const root = new TransformNode(`target_${id}`, s);
    const body = new TransformNode(`targetBody_${id}`, s);
    body.parent = root;

    const post = MeshBuilder.CreateCylinder(`post_${id}`, { height: 1.8, diameter: 0.18, tessellation: 6 }, s);
    post.position.y = 0.9;
    post.material = this.mat('BARK');
    const straw = MeshBuilder.CreateCylinder(`straw_${id}`, { height: 0.9, diameterTop: 0.55, diameterBottom: 0.75, tessellation: 7 }, s);
    straw.position.y = 1.15;
    straw.material = this.mat(t.kind === 'sparring' ? 'GOLD' : 'EARTH');
    const head = MeshBuilder.CreateIcoSphere(`head_${id}`, { radius: 0.28, subdivisions: 1 }, s);
    head.position.y = 1.85;
    head.material = this.mat('CREAM');
    const arm = MeshBuilder.CreateBox(`arm_${id}`, { width: 1.3, height: 0.12, depth: 0.12 }, s);
    arm.position.y = 1.45;
    arm.material = this.mat('BARK');
    for (const m of [post, straw, head, arm]) {
      m.parent = body;
      m.convertToFlatShadedMesh();
      m.isPickable = false;
    }

    const ring = MeshBuilder.CreateTorus(`ring_${id}`, { diameter: 1.1, thickness: 0.08, tessellation: 16 }, s);
    ring.position.y = 0.05;
    ring.material = this.mat(ELEMENT_COLOR[t.element as Element] ?? 'STONE', true);
    ring.parent = root;

    const barBg = MeshBuilder.CreatePlane(`barBg_${id}`, { width: 1.0, height: 0.1 }, s);
    barBg.material = this.mat('INK', true);
    const barFill = MeshBuilder.CreatePlane(`barFill_${id}`, { width: 0.96, height: 0.06 }, s);
    barFill.material = this.mat('FIRE', true);
    barFill.position.z = -0.01;
    const bar = new TransformNode(`bar_${id}`, s);
    bar.parent = root;
    bar.position.y = 2.45;
    bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    barBg.parent = bar;
    barFill.parent = bar;

    const v = { root, body, barFill };
    this.visuals.set(id, v);
    return v;
  }

  sync(targets: Map<string, NetTarget> | { forEach(cb: (t: NetTarget, id: string) => void): void }): void {
    targets.forEach((t, id) => {
      const v = this.visuals.get(id) ?? this.create(id, t);
      v.root.position.set(t.x, t.y, t.z);
      v.body.rotation.y = Math.atan2(t.fx, t.fz);
      // Stunned dummies lean back; broken ones (hp 0) lie down until they reset.
      v.body.rotation.x = t.hp === 0 ? -1.3 : t.stunned ? -0.35 : 0;
      const k = t.maxHp > 0 ? t.hp / t.maxHp : 0;
      v.barFill.scaling.x = Math.max(0.001, k);
      v.barFill.position.x = -(1 - k) * 0.48;
    });
  }
}
