import { DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, type Scene } from '@babylonjs/core';
import { PPU, type Vec3 } from '@aranya/shared';
import { color, type PaletteName } from '../palette.ts';
import { GLYPHS } from '../ui/bitmapFont.ts';

/**
 * Floating damage numbers in a 5x7 bitmap font (Art Bible V-11: digits are a
 * bitmap font, not the vector UI font). Drawn at sprite pixel scale with an
 * INK outline; crits are drawn twice as large.
 */

const CANVAS_W = 64;
const CANVAS_H = 24;
const LIFETIME_MS = 750;
const RISE_M = 0.9;
const POOL_SIZE = 40;

interface Entry {
  mesh: Mesh;
  tex: DynamicTexture;
  age: number;
  start: Vec3;
  active: boolean;
}

export class DamageNumbers {
  private readonly pool: Entry[] = [];
  private next = 0;
  /** Total numbers shown, for the e2e probe. */
  spawned = 0;

  constructor(scene: Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const tex = new DynamicTexture(`dmgTex${i}`, { width: CANVAS_W, height: CANVAS_H }, scene, false, Texture.NEAREST_SAMPLINGMODE);
      tex.hasAlpha = true;
      const mat = new StandardMaterial(`dmgMat${i}`, scene);
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.fogEnabled = false;
      const mesh = MeshBuilder.CreatePlane(`dmg${i}`, { width: CANVAS_W / PPU, height: CANVAS_H / PPU }, scene);
      mesh.material = mat;
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.renderingGroupId = 1; // always readable over the scene
      mesh.setEnabled(false);
      this.pool.push({ mesh, tex, age: 0, start: { x: 0, y: 0, z: 0 }, active: false });
    }
  }

  show(at: Vec3, text: string, tint: PaletteName, big = false): void {
    const e = this.pool[this.next]!;
    this.next = (this.next + 1) % this.pool.length;
    this.draw(e.tex, text, tint, big ? 2 : 1);
    e.age = 0;
    e.start = { x: at.x + (Math.random() - 0.5) * 0.4, y: at.y + 2.1, z: at.z };
    e.active = true;
    e.mesh.position.set(e.start.x, e.start.y, e.start.z);
    e.mesh.setEnabled(true);
    this.spawned++;
  }

  update(dtMs: number): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      e.age += dtMs;
      if (e.age >= LIFETIME_MS) {
        e.active = false;
        e.mesh.setEnabled(false);
        continue;
      }
      const k = e.age / LIFETIME_MS;
      e.mesh.position.y = e.start.y + RISE_M * (1 - (1 - k) * (1 - k));
    }
  }

  private draw(tex: DynamicTexture, text: string, tint: PaletteName, scale: number): void {
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const glyphs = [...text].map((ch) => GLYPHS[ch]).filter((g): g is readonly string[] => !!g);
    const advance = 6 * scale;
    const width = glyphs.length * advance - scale;
    const ox = Math.floor((CANVAS_W - width) / 2);
    const oy = Math.floor((CANVAS_H - 7 * scale) / 2);
    const plot = (fill: string, dx: number, dy: number): void => {
      ctx.fillStyle = fill;
      glyphs.forEach((g, gi) => {
        g.forEach((row, y) => {
          for (let x = 0; x < 5; x++) {
            if (row[x] === '1') ctx.fillRect(ox + gi * advance + x * scale + dx, oy + y * scale + dy, scale, scale);
          }
        });
      });
    };
    const ink = color('INK').hex;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) plot(ink, dx, dy);
    plot(color(tint).hex, 0, 0);
    tex.update(true);
  }
}
