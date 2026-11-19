import { Color3, MeshBuilder, PointerEventTypes, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import type { Vec3 } from '@aranya/shared';
import { color } from '../palette.ts';
import { TargetViews, type TargetInfo } from '../world/targets.ts';

/** Farthest target that can be locked or auto-aimed at (m). */
export const LOCK_RANGE = 12;

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Next target for Tab-cycling: candidates in range sorted by distance; returns
 * the one after `current`, wrapping around, or the nearest when nothing is locked.
 */
export function nextTarget(candidates: readonly TargetInfo[], from: Vec3, current: string | null, range = LOCK_RANGE): string | null {
  const inRange = candidates.filter((t) => t.hp > 0 && dist(t.pos, from) <= range).sort((a, b) => dist(a.pos, from) - dist(b.pos, from));
  if (inRange.length === 0) return null;
  const i = inRange.findIndex((t) => t.id === current);
  return inRange[(i + 1) % inRange.length]!.id;
}

/** Aim direction towards a locked target, or null when it is gone or out of range. */
export function aimAt(target: TargetInfo | null, from: Vec3, range = LOCK_RANGE): { fx: number; fz: number } | null {
  if (!target || target.hp <= 0) return null;
  const dx = target.pos.x - from.x;
  const dz = target.pos.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range || d < 1e-3) return null;
  return { fx: dx / d, fz: dz / d };
}

/**
 * Soft lock (GDD 4.3): left-click/tap a monster or press Tab to lock it; skills then
 * aim at it automatically. The lock is only an aiming aid: the client still
 * sends just "skill + direction" and the server decides what is hit.
 */
export class SoftLock {
  selected: string | null = null;
  private readonly ring: Mesh;

  constructor(scene: Scene, private readonly targets: TargetViews) {
    const mat = new StandardMaterial('softLockMat', scene);
    mat.diffuseColor = Color3.FromHexString(color('GOLD').hex);
    mat.emissiveColor = mat.diffuseColor;
    mat.disableLighting = true;
    this.ring = MeshBuilder.CreateTorus('softLockRing', { diameter: 1.3, thickness: 0.07, tessellation: 24 }, scene);
    this.ring.material = mat;
    this.ring.isPickable = false;
    this.ring.renderingGroupId = 1;
    this.ring.setEnabled(false);

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOWN || (info.event as PointerEvent).button !== 0) return;
      const id = TargetViews.idOf(info.pickInfo?.pickedMesh);
      if (id) this.selected = id;
    });
  }

  cycle(from: Vec3): void {
    this.selected = nextTarget(this.targets.all(), from, this.selected);
  }

  target(): TargetInfo | null {
    return this.selected ? this.targets.get(this.selected) : null;
  }

  aim(from: Vec3): { fx: number; fz: number } | null {
    return aimAt(this.target(), from);
  }

  update(): void {
    const t = this.target();
    if (!t || t.hp <= 0) {
      if (t && t.hp <= 0) this.selected = null;
      this.ring.setEnabled(false);
      return;
    }
    this.ring.setEnabled(true);
    this.ring.position.set(t.pos.x, t.pos.y + 0.06, t.pos.z);
  }
}
