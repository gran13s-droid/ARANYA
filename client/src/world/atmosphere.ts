import {
  Color3,
  Color4,
  DynamicTexture,
  ParticleSystem,
  PointLight,
  Vector3,
  type DirectionalLight,
  type HemisphericLight,
  type Scene,
} from '@babylonjs/core';
import { areaAt, type LevelArea, type LevelFile, type LevelLight, type ParticleKind } from '@aranya/shared';
import { isMobile } from '../device.ts';
import { color, type PaletteName } from '../palette.ts';

const c3 = (name: PaletteName): Color3 => Color3.FromHexString(color(name).hex);

/** Seconds for fog and light to settle after entering another area. */
const BLEND_S = 1.2;
/** Dynamic point lights drawn at once (Art Bible 10.4: PC 4, mobile 1). */
const MAX_LIGHTS = isMobile() ? 1 : 4;
/** Lights farther than this from the player are never picked. */
const LIGHT_PICK_RANGE = 30;
const LIGHT_PICK_EVERY_MS = 300;

/** Particle budgets (Art Bible 10.11 fireflies 150 / 60, 10.13 curse motes 100 / 40). */
const PARTICLES: Record<ParticleKind, { pc: number; mobile: number; colors: [PaletteName, PaletteName]; additive: boolean; size: [number, number]; life: [number, number]; rise: number; spreadY: [number, number] }> = {
  leaves: { pc: 40, mobile: 20, colors: ['MOSS', 'FOREST'], additive: false, size: [0.07, 0.12], life: [5, 8], rise: -0.5, spreadY: [3, 9] },
  dust: { pc: 40, mobile: 20, colors: ['GOLD', 'CREAM'], additive: false, size: [0.04, 0.08], life: [3, 5], rise: 0.05, spreadY: [0.2, 2.5] },
  fireflies: { pc: 150, mobile: 60, colors: ['SPIRIT', 'GOLD'], additive: true, size: [0.08, 0.14], life: [3, 6], rise: 0.05, spreadY: [0.4, 3] },
  curse: { pc: 100, mobile: 40, colors: ['CURSE', 'PURPLE_DEEP'], additive: true, size: [0.06, 0.12], life: [4, 7], rise: 0.25, spreadY: [0, 2] },
};

interface Look {
  fog: Color3;
  density: number;
  sun: Color3;
  sunIntensity: number;
  ambient: Color3;
  ground: Color3;
  ambientIntensity: number;
}

function lookOf(area: LevelArea): Look {
  return {
    fog: c3(area.fog.color),
    density: area.fog.density,
    sun: c3(area.sun.color),
    sunIntensity: area.sun.intensity,
    ambient: c3(area.ambient.color),
    ground: c3(area.ambient.ground),
    ambientIntensity: area.ambient.intensity,
  };
}

/**
 * Per-area mood (Art Bible 10.5): fog, light colors, ambient particles and
 * the few dynamic lights near the player. Client-only and purely visual.
 */
export class Atmosphere {
  private area: LevelArea | null = null;
  private current: Look | null = null;
  private target: Look | null = null;
  private readonly particles = new Map<ParticleKind, ParticleSystem>();
  private readonly lights: PointLight[] = [];
  private lastPick = -Infinity;
  /** Called when the player enters another area (area banner). */
  onAreaChange: ((area: LevelArea) => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly file: LevelFile,
    private readonly sun: DirectionalLight,
    private readonly ambient: HemisphericLight,
  ) {
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new PointLight(`areaLight_${i}`, Vector3.Zero(), scene);
      l.intensity = 0;
      l.setEnabled(false);
      this.lights.push(l);
    }
  }

  get areaId(): string | null {
    return this.area?.id ?? null;
  }

  update(dtMs: number, pos: { x: number; y: number; z: number }): void {
    const area = areaAt(this.file, pos) ?? this.area;
    if (area && area !== this.area) {
      this.area = area;
      this.target = lookOf(area);
      if (!this.current) this.current = { ...this.target };
      this.setParticles(area.particles ?? null);
      this.onAreaChange?.(area);
    }
    if (this.current && this.target) {
      const k = 1 - Math.exp(-dtMs / 1000 / (BLEND_S / 3));
      const c = this.current, t = this.target;
      c.fog = Color3.Lerp(c.fog, t.fog, k);
      c.density += (t.density - c.density) * k;
      c.sun = Color3.Lerp(c.sun, t.sun, k);
      c.sunIntensity += (t.sunIntensity - c.sunIntensity) * k;
      c.ambient = Color3.Lerp(c.ambient, t.ambient, k);
      c.ground = Color3.Lerp(c.ground, t.ground, k);
      c.ambientIntensity += (t.ambientIntensity - c.ambientIntensity) * k;
      this.apply(c);
    }
    for (const ps of this.particles.values()) (ps.emitter as Vector3).set(pos.x, pos.y, pos.z);
    const now = performance.now();
    if (now - this.lastPick >= LIGHT_PICK_EVERY_MS) {
      this.lastPick = now;
      this.pickLights(pos);
    }
  }

  private apply(c: Look): void {
    const s = this.scene;
    s.fogColor = c.fog;
    s.fogDensity = c.density;
    s.clearColor = new Color4(c.fog.r, c.fog.g, c.fog.b, 1);
    this.sun.diffuse = c.sun;
    this.sun.intensity = c.sunIntensity;
    this.ambient.diffuse = c.ambient;
    this.ambient.groundColor = c.ground;
    this.ambient.intensity = c.ambientIntensity;
  }

  /** Nearest level lights within range get the pooled point lights; the rest stay baked/emissive. */
  private pickLights(pos: { x: number; y: number; z: number }): void {
    const near = this.file.lights
      .map((l) => ({ l, d: Math.hypot(l.x - pos.x, l.y - pos.y, l.z - pos.z) }))
      .filter((e) => e.d <= LIGHT_PICK_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_LIGHTS)
      .map((e) => e.l);
    this.lights.forEach((light, i) => {
      const src: LevelLight | undefined = near[i];
      light.setEnabled(!!src);
      if (!src) return;
      light.position.set(src.x, src.y, src.z);
      light.diffuse = c3(src.color);
      light.specular = Color3.Black();
      light.range = src.range;
      light.intensity = 1.2;
    });
  }

  get activeLights(): number {
    return this.lights.filter((l) => l.isEnabled()).length;
  }

  private setParticles(kind: ParticleKind | null): void {
    for (const [k, ps] of this.particles) if (k !== kind) ps.stop();
    if (!kind) return;
    let ps = this.particles.get(kind);
    if (!ps) {
      ps = this.createParticles(kind);
      this.particles.set(kind, ps);
    }
    ps.start();
  }

  private createParticles(kind: ParticleKind): ParticleSystem {
    const spec = PARTICLES[kind];
    const count = isMobile() ? spec.mobile : spec.pc;
    const ps = new ParticleSystem(`particles_${kind}`, count, this.scene);
    // A 2x2 white texel: particles stay flat palette-colored squares (pixel art, no soft sprite).
    const tex = new DynamicTexture(`particleTex_${kind}`, { width: 2, height: 2 }, this.scene, false, DynamicTexture.NEAREST_SAMPLINGMODE);
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
    tex.update();
    ps.particleTexture = tex;
    ps.emitter = Vector3.Zero();
    ps.minEmitBox = new Vector3(-14, spec.spreadY[0], -10);
    ps.maxEmitBox = new Vector3(14, spec.spreadY[1], 14);
    const [a, b] = spec.colors;
    ps.color1 = Color4.FromColor3(c3(a), 1);
    ps.color2 = Color4.FromColor3(c3(b), 1);
    ps.colorDead = Color4.FromColor3(c3(b), 0);
    ps.minSize = spec.size[0];
    ps.maxSize = spec.size[1];
    ps.minLifeTime = spec.life[0];
    ps.maxLifeTime = spec.life[1];
    ps.emitRate = count / ((spec.life[0] + spec.life[1]) / 2);
    ps.blendMode = spec.additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, spec.rise, 0);
    ps.direction1 = new Vector3(-0.3, -0.1, -0.3);
    ps.direction2 = new Vector3(0.3, 0.1, 0.3);
    ps.minEmitPower = 0.1;
    ps.maxEmitPower = 0.4;
    ps.updateSpeed = 1 / 60;
    ps.isLocal = false;
    return ps;
  }
}
