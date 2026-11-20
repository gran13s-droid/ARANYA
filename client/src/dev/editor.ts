import {
  Color3,
  Matrix,
  MeshBuilder,
  PointerEventTypes,
  StandardMaterial,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import {
  MONSTERS,
  PROP_KINDS,
  formatLevelFile,
  parseLevelFile,
  type Level,
  type LevelError,
  type LevelFile,
  type MonsterId,
  type PropKind,
  type Vec3,
} from '@aranya/shared';
import { t } from '../i18n.ts';
import { groundHit } from '../input/clickMove.ts';
import { color } from '../palette.ts';
import type { World } from '../world/world.ts';

/** Placement grid (Art Bible 10.3: the modular kit snaps to 1 m or 0.5 m). */
const SNAP = 0.5;
const ROT_STEP = 15;
/** A click selects the nearest prop or spawn within this distance (m). */
const PICK_RADIUS = 1.5;

type Item = { type: 'prop'; index: number } | { type: 'spawn'; index: number };

const snap = (v: number): number => Math.round(v / SNAP) * SNAP;

/**
 * Dev-only level editor (`?editor`, ROADMAP 2.1). Places, moves, rotates,
 * scales and deletes props and monster spawns of the loaded level file, then
 * saves it through the Vite dev endpoint (client/vite.config.ts). Visuals
 * update at once; collision follows after Save (the server restarts with the
 * new file and the page reloads). WASD still walks the character.
 *
 * Mouse: Shift+click places the selected tool, click selects the nearest item.
 * Keys: Q/E rotate, [ ] scale, I J K L nudge 0.5 m, Delete removes, Ctrl+S saves.
 */
export class LevelEditor {
  private selected: Item | null = null;
  private tool = 'prop:tree';
  private readonly panel: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly marker: Mesh;
  private spawnMarkers: Mesh[] = [];
  private readonly spawnMat: StandardMaterial;
  dirty = false;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly file: LevelFile,
    private readonly level: Level,
  ) {
    const mat = new StandardMaterial('editorMarker', scene);
    mat.emissiveColor = Color3.FromHexString(color('GOLD').hex);
    mat.disableLighting = true;
    this.marker = MeshBuilder.CreateTorus('editorSelection', { diameter: 1.6, thickness: 0.08, tessellation: 24 }, scene);
    this.marker.material = mat;
    this.marker.isPickable = false;
    this.marker.renderingGroupId = 1;
    this.marker.setEnabled(false);
    this.spawnMat = new StandardMaterial('editorSpawn', scene);
    this.spawnMat.emissiveColor = Color3.FromHexString(color('CURSE').hex);
    this.spawnMat.disableLighting = true;

    this.panel = document.createElement('div');
    this.panel.className = 'editor-panel';
    const title = document.createElement('b');
    title.textContent = t('editor.title', { level: file.id });
    const select = document.createElement('select');
    for (const kind of Object.keys(PROP_KINDS)) select.add(new Option(kind, `prop:${kind}`));
    for (const species of Object.keys(MONSTERS)) select.add(new Option(`spawn: ${species}`, `spawn:${species}`));
    select.value = this.tool;
    select.addEventListener('change', () => (this.tool = select.value));
    const save = document.createElement('button');
    save.textContent = t('editor.save');
    save.addEventListener('click', () => void this.save());
    const help = document.createElement('div');
    help.className = 'editor-help';
    help.textContent = t('editor.help');
    this.info = document.createElement('div');
    this.info.className = 'editor-info';
    this.panel.append(title, select, save, this.info, help);
    document.body.append(this.panel);

    // Runs before the game's own pointer handlers and stops them (no click-to-move / lock while editing).
    scene.onPointerObservable.add((info, state) => {
      const e = info.event as PointerEvent;
      if (e.button !== 0) return;
      state.skipNextObservers = true;
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      const p = this.groundUnderCursor();
      if (!p) return;
      if (e.shiftKey) this.place(p);
      else this.select(p);
    }, undefined, true);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.refreshSpawns();
    this.showInfo();
  }

  /** Counts for the dev probe / e2e. */
  stats(): { props: number; spawns: number; selected: string | null; dirty: boolean } {
    return { props: this.file.props.length, spawns: this.file.spawns.length, selected: this.selectedId(), dirty: this.dirty };
  }

  private groundUnderCursor(): Vec3 | null {
    const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), this.scene.activeCamera);
    return groundHit(this.level, ray.origin, ray.direction);
  }

  private place(p: Vec3): void {
    const [type, name] = this.tool.split(':') as ['prop' | 'spawn', string];
    const x = snap(p.x), z = snap(p.z), y = Math.round(p.y * 100) / 100;
    if (type === 'prop') {
      const kind = name as PropKind;
      this.file.props.push({ id: this.nextId(kind, this.file.props.map((q) => q.id)), kind, x, y, z, rot: 0 });
      this.selected = { type: 'prop', index: this.file.props.length - 1 };
    } else {
      const species = name as MonsterId;
      this.file.spawns.push({ id: this.nextId(species, this.file.spawns.map((s) => s.id)), species, x, y, z });
      this.selected = { type: 'spawn', index: this.file.spawns.length - 1 };
    }
    this.changed();
  }

  private nextId(base: string, taken: string[]): string {
    const used = new Set(taken);
    let n = 1;
    while (used.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  private select(p: Vec3): void {
    let best: Item | null = null;
    let bestD = PICK_RADIUS;
    this.file.props.forEach((q, index) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestD && Math.abs(q.y - p.y) < 3) {
        best = { type: 'prop', index };
        bestD = d;
      }
    });
    this.file.spawns.forEach((s, index) => {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bestD && Math.abs(s.y - p.y) < 3) {
        best = { type: 'spawn', index };
        bestD = d;
      }
    });
    this.selected = best;
    this.showInfo();
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      void this.save();
      return;
    }
    const item = this.item();
    if (!item) return;
    const nudge: Record<string, [number, number]> = { KeyI: [0, SNAP], KeyK: [0, -SNAP], KeyJ: [-SNAP, 0], KeyL: [SNAP, 0] };
    if (e.code in nudge) {
      const [dx, dz] = nudge[e.code]!;
      item.x += dx;
      item.z += dz;
    } else if ((e.code === 'KeyQ' || e.code === 'KeyE') && 'rot' in item) {
      item.rot = (item.rot + (e.code === 'KeyQ' ? -ROT_STEP : ROT_STEP) + 360) % 360;
    } else if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && 'rot' in item) {
      const s = Math.max(0.25, Math.min(4, (item.scale ?? 1) + (e.code === 'BracketLeft' ? -0.1 : 0.1)));
      item.scale = Math.round(s * 100) / 100;
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.selected!.type === 'prop') this.file.props.splice(this.selected!.index, 1);
      else this.file.spawns.splice(this.selected!.index, 1);
      this.selected = null;
    } else if (e.code === 'Escape') {
      this.selected = null;
      this.showInfo();
      return;
    } else {
      return;
    }
    this.changed();
  }

  private item(): (LevelFile['props'][number] | LevelFile['spawns'][number]) | null {
    if (!this.selected) return null;
    return (this.selected.type === 'prop' ? this.file.props[this.selected.index] : this.file.spawns[this.selected.index]) ?? null;
  }

  private selectedId(): string | null {
    return this.item()?.id ?? null;
  }

  private changed(): void {
    this.dirty = true;
    this.world.props.rebuild();
    this.refreshSpawns();
    this.showInfo();
  }

  private refreshSpawns(): void {
    for (const m of this.spawnMarkers) m.dispose();
    this.spawnMarkers = this.file.spawns.map((s) => {
      const m = MeshBuilder.CreateCylinder(`editorSpawn_${s.id}`, { height: 1.2, diameterTop: 0, diameterBottom: 0.6, tessellation: 4 }, this.scene);
      m.position.set(s.x, s.y + 0.6, s.z);
      m.material = this.spawnMat;
      m.isPickable = false;
      return m;
    });
  }

  private showInfo(message?: string): void {
    const item = this.item();
    if (item) {
      this.marker.setEnabled(true);
      this.marker.position.set(item.x, item.y + 0.05, item.z);
    } else {
      this.marker.setEnabled(false);
    }
    const desc = item ? `${item.id}  (${item.x}, ${item.y}, ${item.z})${'rot' in item ? `  rot ${item.rot}°  ×${item.scale ?? 1}` : ''}` : t('editor.nothing');
    this.info.textContent = [desc, this.dirty ? t('editor.unsaved') : '', message ?? ''].filter(Boolean).join('\n');
  }

  /** Validates in the browser (same rules as the server), then writes the file through the dev server. */
  async save(): Promise<boolean> {
    let text: string;
    try {
      text = formatLevelFile(parseLevelFile(JSON.parse(JSON.stringify(this.file))));
    } catch (e) {
      const problems = (e as LevelError).problems ?? [String(e)];
      this.showInfo(`${t('editor.invalid')}\n${problems.slice(0, 6).join('\n')}`);
      return false;
    }
    const res = await fetch(`/__aranya/level/${this.file.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
    if (!res.ok) {
      this.showInfo(`${t('editor.saveFailed')} (${res.status})`);
      return false;
    }
    this.dirty = false;
    this.showInfo(t('editor.saved'));
    return true;
  }
}
