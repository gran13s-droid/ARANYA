import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3, VertexData, type LinesMesh, type Scene } from '@babylonjs/core';
import type { HitShape, TelegraphEvent } from '@aranya/shared';
import { color } from '../palette.ts';

/**
 * Enemy ground warnings (Art Bible 8.5): blinking CREAM edge + FIRE fill at
 * 35% that grows from the center to show the time left. The shape and timing
 * come from the server event, so what is drawn is exactly what will hit.
 */
const SEGMENTS = 24;
const LIFT = 0.05;
const BLINK_MS = 120;

interface Active {
  fill: Mesh;
  edge: LinesMesh;
  age: number;
  duration: number;
}

/** Outline points of a shape in local space (+z forward). */
function outline(shape: HitShape): { x: number; z: number }[] {
  if (shape.kind === 'circle') {
    return Array.from({ length: SEGMENTS + 1 }, (_, i) => {
      const a = (i / SEGMENTS) * Math.PI * 2;
      return { x: Math.sin(a) * shape.radius, z: Math.cos(a) * shape.radius };
    });
  }
  if (shape.kind === 'line') {
    const w = shape.width / 2;
    return [{ x: -w, z: 0 }, { x: -w, z: shape.length }, { x: w, z: shape.length }, { x: w, z: 0 }, { x: -w, z: 0 }];
  }
  const half = (shape.angleDeg / 2) * (Math.PI / 180);
  const arc = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
    const a = -half + (i / SEGMENTS) * half * 2;
    return { x: Math.sin(a) * shape.radius, z: Math.cos(a) * shape.radius };
  });
  return [{ x: 0, z: 0 }, ...arc, { x: 0, z: 0 }];
}

export class Telegraphs {
  private readonly active: Active[] = [];
  private readonly fillMat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.fillMat = new StandardMaterial('telegraphFill', scene);
    this.fillMat.diffuseColor = Color3.FromHexString(color('FIRE').hex);
    this.fillMat.emissiveColor = this.fillMat.diffuseColor;
    this.fillMat.disableLighting = true;
    this.fillMat.alpha = 0.35;
    this.fillMat.backFaceCulling = false;
    this.fillMat.zOffset = -2;
  }

  get count(): number {
    return this.active.length;
  }

  show(evt: TelegraphEvent): void {
    const pts = outline(evt.shape);
    const fill = new Mesh('telegraphFill', this.scene);
    const positions: number[] = [];
    const indices: number[] = [];
    // Fan from the shape's first point (the origin for arcs, an edge point for circles/lines).
    for (const p of pts) positions.push(p.x, 0, p.z);
    for (let i = 1; i < pts.length - 1; i++) indices.push(0, i, i + 1);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.applyToMesh(fill);
    fill.material = this.fillMat;
    fill.isPickable = false;

    const edge = MeshBuilder.CreateLines('telegraphEdge', { points: pts.map((p) => new Vector3(p.x, 0, p.z)) }, this.scene);
    edge.color = Color3.FromHexString(color('CREAM').hex);
    edge.isPickable = false;

    const yaw = Math.atan2(evt.fx, evt.fz);
    for (const m of [fill, edge]) {
      m.position.set(evt.x, evt.y + LIFT, evt.z);
      m.rotation.y = yaw;
      m.renderingGroupId = 1; // warnings draw over every VFX (Art Bible 8.1)
    }
    fill.scaling.set(0.01, 1, 0.01);
    this.active.push({ fill, edge, age: 0, duration: evt.durationMs });
  }

  update(dtMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i]!;
      a.age += dtMs;
      if (a.age >= a.duration) {
        a.fill.dispose();
        a.edge.dispose();
        this.active.splice(i, 1);
        continue;
      }
      const k = Math.max(0.01, a.age / a.duration);
      a.fill.scaling.set(k, 1, k);
      a.edge.isVisible = Math.floor(a.age / BLINK_MS) % 2 === 0;
    }
  }
}
