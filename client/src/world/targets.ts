import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, type AbstractMesh, type Scene } from '@babylonjs/core';
import { INTERPOLATION_DELAY_MS, MONSTERS, type Element, type MonsterId, type Vec3 } from '@aranya/shared';
import { InterpolationBuffer } from '../net/interpolation.ts';
import { color, type PaletteName } from '../palette.ts';

/** Synced target fields (server/src/state.ts TargetState). */
export interface NetTarget {
  kind: string;
  species: string;
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
  buffer: InterpolationBuffer;
  last: NetTarget;
  hover: number;
  age: number;
}

/** What other systems need to know about a target (soft lock, aiming). */
export interface TargetInfo {
  id: string;
  kind: string;
  species: string;
  pos: Vec3;
  hp: number;
  maxHp: number;
}

/**
 * Training dummies (หุ่นฟาง) and Step 1.3 monsters as low-poly placeholders
 * with an element ring and an HP bar. Positions are interpolated like remote
 * players (100 ms behind), so 20 Hz updates move smoothly at 60 fps.
 * Every mesh carries `metadata.targetId` so clicks can select it (soft lock).
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

  private part(id: string, mesh: Mesh, parent: TransformNode, mat: PaletteName, unlit = false): Mesh {
    mesh.parent = parent;
    mesh.material = this.mat(mat, unlit);
    mesh.metadata = { targetId: id };
    return mesh;
  }

  private buildDummy(id: string, t: NetTarget, body: TransformNode): void {
    const s = this.scene;
    const post = this.part(id, MeshBuilder.CreateCylinder(`post_${id}`, { height: 1.8, diameter: 0.18, tessellation: 6 }, s), body, 'BARK');
    post.position.y = 0.9;
    const straw = this.part(id, MeshBuilder.CreateCylinder(`straw_${id}`, { height: 0.9, diameterTop: 0.55, diameterBottom: 0.75, tessellation: 7 }, s), body, t.kind === 'sparring' ? 'GOLD' : 'EARTH');
    straw.position.y = 1.15;
    const head = this.part(id, MeshBuilder.CreateIcoSphere(`head_${id}`, { radius: 0.28, subdivisions: 1 }, s), body, 'CREAM');
    head.position.y = 1.85;
    const arm = this.part(id, MeshBuilder.CreateBox(`arm_${id}`, { width: 1.3, height: 0.12, depth: 0.12 }, s), body, 'BARK');
    arm.position.y = 1.45;
  }

  /** Placeholder shapes until the 48x48 monster sprites exist (tracker M-01..M-03). */
  private buildMonster(id: string, species: MonsterId, body: TransformNode): void {
    const s = this.scene;
    if (species === 'lostMom') {
      // Small bark-skinned forest spirit: cream mask, jade scarf, CURSE eyes (Art Bible 7.7).
      const torso = this.part(id, MeshBuilder.CreateCylinder(`torso_${id}`, { height: 0.55, diameterTop: 0.35, diameterBottom: 0.15, tessellation: 6 }, s), body, 'BARK');
      torso.position.y = 0.35;
      const head = this.part(id, MeshBuilder.CreateIcoSphere(`head_${id}`, { radius: 0.3, subdivisions: 1 }, s), body, 'CREAM');
      head.position.y = 0.85;
      const knot = this.part(id, MeshBuilder.CreateIcoSphere(`knot_${id}`, { radius: 0.13, subdivisions: 1 }, s), body, 'BARK');
      knot.position.y = 1.18;
      const scarf = this.part(id, MeshBuilder.CreateTorus(`scarf_${id}`, { diameter: 0.4, thickness: 0.08, tessellation: 10 }, s), body, 'PURPLE_DEEP');
      scarf.position.y = 0.6;
      for (const side of [-1, 1]) {
        const eye = this.part(id, MeshBuilder.CreateBox(`eye_${id}_${side}`, { size: 0.07 }, s), body, 'CURSE', true);
        eye.position.set(side * 0.1, 0.88, 0.27);
      }
    } else if (species === 'fireFowl') {
      const torso = this.part(id, MeshBuilder.CreateIcoSphere(`torso_${id}`, { radius: 0.35, subdivisions: 1 }, s), body, 'FIRE');
      torso.position.y = 0.45;
      torso.scaling.set(1, 0.85, 1.2);
      const head = this.part(id, MeshBuilder.CreateIcoSphere(`head_${id}`, { radius: 0.17, subdivisions: 1 }, s), body, 'FIRE');
      head.position.set(0, 0.85, 0.28);
      const beak = this.part(id, MeshBuilder.CreateCylinder(`beak_${id}`, { height: 0.18, diameterTop: 0, diameterBottom: 0.1, tessellation: 4 }, s), body, 'GOLD');
      beak.position.set(0, 0.85, 0.45);
      beak.rotation.x = Math.PI / 2;
      const tail = this.part(id, MeshBuilder.CreateCylinder(`tail_${id}`, { height: 0.5, diameterTop: 0.3, diameterBottom: 0.05, tessellation: 5 }, s), body, 'GOLD');
      tail.position.set(0, 0.7, -0.35);
      tail.rotation.x = -0.6;
      for (const side of [-1, 1]) {
        const leg = this.part(id, MeshBuilder.CreateCylinder(`leg_${id}_${side}`, { height: 0.3, diameter: 0.05, tessellation: 4 }, s), body, 'EARTH');
        leg.position.set(side * 0.1, 0.12, 0);
      }
    } else {
      // ผีโขมด: a floating fire wisp (ramp ไฟ, Art Bible 3).
      const core = this.part(id, MeshBuilder.CreateIcoSphere(`core_${id}`, { radius: 0.28, subdivisions: 2 }, s), body, 'CREAM', true);
      core.position.y = 0.4;
      const flame = this.part(id, MeshBuilder.CreateIcoSphere(`flame_${id}`, { radius: 0.4, subdivisions: 1 }, s), body, 'FIRE', true);
      flame.position.y = 0.45;
      flame.scaling.set(1, 1.3, 1);
      flame.visibility = 0.6;
    }
    for (const m of body.getChildMeshes()) if (m instanceof Mesh) m.convertToFlatShadedMesh();
  }

  private create(id: string, t: NetTarget): Visual {
    const s = this.scene;
    const root = new TransformNode(`target_${id}`, s);
    const body = new TransformNode(`targetBody_${id}`, s);
    body.parent = root;
    const isMonster = t.kind === 'monster' && t.species in MONSTERS;
    if (isMonster) this.buildMonster(id, t.species as MonsterId, body);
    else this.buildDummy(id, t, body);

    const ring = this.part(id, MeshBuilder.CreateTorus(`ring_${id}`, { diameter: isMonster ? 0.9 : 1.1, thickness: 0.06, tessellation: 16 }, s), root, ELEMENT_COLOR[t.element as Element] ?? 'STONE', true);
    ring.position.y = 0.05;

    const barBg = MeshBuilder.CreatePlane(`barBg_${id}`, { width: 1.0, height: 0.1 }, s);
    barBg.material = this.mat('INK', true);
    const barFill = MeshBuilder.CreatePlane(`barFill_${id}`, { width: 0.96, height: 0.06 }, s);
    barFill.material = this.mat('FIRE', true);
    barFill.position.z = -0.01;
    const bar = new TransformNode(`bar_${id}`, s);
    bar.parent = root;
    bar.position.y = isMonster ? 1.7 : 2.45;
    bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    barBg.parent = bar;
    barFill.parent = bar;

    const hover = isMonster ? (MONSTERS[t.species as MonsterId].hoverM ?? 0) : 0;
    const v: Visual = { root, body, barFill, buffer: new InterpolationBuffer(), last: t, hover, age: Math.random() * 1000 };
    this.visuals.set(id, v);
    return v;
  }

  /** Called on every state patch. */
  sync(targets: { forEach(cb: (t: NetTarget, id: string) => void): void }, now: number): void {
    targets.forEach((t, id) => {
      const v = this.visuals.get(id) ?? this.create(id, t);
      // Snap instead of sliding across the map when a monster respawns.
      if (v.last.hp === 0 && t.hp > 0) v.buffer = new InterpolationBuffer();
      v.buffer.push(now, { x: t.x, y: t.y, z: t.z });
      v.last = { ...t };
    });
  }

  /** Called every frame. */
  update(dtMs: number, now: number): void {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    for (const v of this.visuals.values()) {
      const t = v.last;
      v.root.setEnabled(t.hp > 0 || t.kind !== 'monster');
      const p = v.buffer.sample(renderTime);
      if (p) v.root.position.set(p.x, p.y, p.z);
      v.age += dtMs;
      v.body.position.y = v.hover > 0 ? v.hover + Math.sin(v.age / 300) * 0.06 : 0;
      v.body.rotation.y = Math.atan2(t.fx, t.fz);
      // Stunned targets lean back; broken dummies lie down until they reset.
      v.body.rotation.x = t.hp === 0 ? -1.3 : t.stunned ? -0.35 : 0;
      const k = t.maxHp > 0 ? t.hp / t.maxHp : 0;
      v.barFill.scaling.x = Math.max(0.001, k);
      v.barFill.position.x = -(1 - k) * 0.48;
    }
  }

  get(id: string): TargetInfo | null {
    const v = this.visuals.get(id);
    if (!v) return null;
    const t = v.last;
    return { id, kind: t.kind, species: t.species, pos: { x: v.root.position.x, y: v.root.position.y, z: v.root.position.z }, hp: t.hp, maxHp: t.maxHp };
  }

  all(): TargetInfo[] {
    return [...this.visuals.keys()].map((id) => this.get(id)!).filter((t) => t.hp > 0);
  }

  /** The target id of a picked mesh (soft lock by click/tap). */
  static idOf(mesh: AbstractMesh | null | undefined): string | null {
    const id = (mesh?.metadata as { targetId?: unknown } | null | undefined)?.targetId;
    return typeof id === 'string' ? id : null;
  }
}
