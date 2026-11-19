import { HOTBAR, type Element, type HotbarSkill } from '@aranya/shared';
import { t, type MessageKey } from '../i18n.ts';
import { drawDigits, textWidth } from './bitmapFont.ts';
import { color } from '../palette.ts';
import {
  BAR_EXP, BAR_HP, BAR_RESOURCE, barTail, digits, elementGem, ICON_PX, levelBadge, paintBar, paintGem, paintPortrait,
  skillIcon, SLOT_PX, slotFrame, uiPixelSize, WELL_R, type BarStyle, type SlotState,
} from './pixelArt.ts';

/** PC keys for the hotbar slots 1-7 (GDD 4.3). Left mouse: click locks a target, hold attacks. */
export const HOTBAR_KEYS: Record<HotbarSkill, { code: string; label: string }> = {
  attack: { code: 'Digit1', label: '1' },
  stance: { code: 'Digit2', label: '2' },
  lunge: { code: 'Digit3', label: '3' },
  parry: { code: 'Digit4', label: '4' },
  ultimate: { code: 'Digit5', label: '5' },
  potion: { code: 'Digit6', label: '6' },
  manaPotion: { code: 'Digit7', label: '7' },
};

/** Dodge is not on the hotbar (GDD 4.3). */
export const DODGE_KEY = 'Space';

export interface HudState {
  hp: number;
  maxHp: number;
  resource: number;
  resourceMax: number;
  dead: boolean;
  /** 0..1 remaining cooldown per slot. */
  cooldown: Partial<Record<HotbarSkill, number>>;
}

export interface HudTarget {
  name: string;
  hp: number;
  maxHp: number;
  level: number | null;
  element: Element | null;
}

/** Layout in 640x360 UI pixels (Art Bible 9.1-9.2). */
const UI = {
  margin: 6,
  portrait: 48,
  bars: { x: 42, hpY: 6, resY: 19, w: 104, resW: 92, h: 11 },
  exp: { x: 46, y: 32, barY: 41, w: 80, h: 6 },
  slotPitch: 38,
  labelH: 9,
  targetPortrait: 32,
  target: { w: 150, barX: 34, barY: 17, barW: 96 },
} as const;

/**
 * Placeholder pixel HUD after the UI concept (reference 2): player frame
 * (portrait, level badge, HP / มานา / EXP bars), the 7-slot diamond skill bar
 * and the locked-target panel. Images come from pixelArt.ts at UI size and are
 * scaled by the integer UI scale; text is the vector font (Art Bible 9.1).
 * DOM is only written when a value changes, so there is no per-frame layout.
 */
export class Hud {
  private readonly hpBar: BarView;
  private readonly resBar: BarView;
  private readonly expBar: BarView;
  private readonly portrait: HTMLCanvasElement;
  private readonly hotbar: HTMLDivElement;
  private readonly deadEl: HTMLDivElement;
  private readonly slots = new Map<HotbarSkill, { frame: HTMLImageElement; shade: HTMLDivElement; state: SlotState; rejectedUntil: number }>();
  private readonly written = new Map<string, string>();
  private target: { root: HTMLDivElement; name: HTMLSpanElement; level: HTMLSpanElement; gem: HTMLImageElement; bar: BarView; portrait: HTMLCanvasElement } | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = '';
    root.classList.add('ui-root');

    // ---- player frame (top-left)
    const player = box('ui-player', UI.margin, UI.margin, 160, 48);
    this.portrait = canvas(UI.portrait, UI.portrait);
    place(this.portrait, 0, 0);
    paintPortrait(this.portrait.getContext('2d')!, UI.portrait, null);
    const badge = img(levelBadge(1), 15, 15);
    place(badge, 0, 33);
    this.hpBar = new BarView(UI.bars.w, UI.bars.h, BAR_HP, t('hp'));
    this.resBar = new BarView(UI.bars.resW, UI.bars.h, BAR_RESOURCE, t('resource'));
    this.expBar = new BarView(UI.exp.w, UI.exp.h, BAR_EXP, null);
    place(this.hpBar.el, UI.bars.x, UI.bars.hpY);
    place(this.resBar.el, UI.bars.x, UI.bars.resY);
    place(this.expBar.el, UI.bars.x, UI.exp.barY);
    const expText = el('span', 'ui-text ui-small');
    expText.textContent = t('exp');
    place(expText, UI.exp.x, UI.exp.y);
    const expValue = img(digits('0%'), textWidth('0%') + 2, 9);
    place(expValue, UI.exp.x + 18, UI.exp.y + 1);
    // Bars go behind the portrait ring, as in the concept.
    player.append(this.hpBar.el, this.resBar.el, this.expBar.el, this.portrait, badge, expText, expValue);
    this.expBar.set(0, 1, false);

    // ---- skill bar (bottom-center)
    this.hotbar = el('div', 'ui-hotbar');
    HOTBAR.forEach((skill, i) => {
      const slot = el('div', 'ui-slot');
      slot.title = t(`skill.${skill}`);
      place(slot, i * UI.slotPitch, 0, SLOT_PX, SLOT_PX + UI.labelH);
      const frame = img(slotFrame('ready'), SLOT_PX, SLOT_PX);
      place(frame, 0, 0);
      const off = (SLOT_PX - ICON_PX) / 2;
      const icon = img(skillIcon(skill), ICON_PX, ICON_PX);
      place(icon, off, off);
      icon.classList.add('ui-icon');
      const shade = el('div', 'ui-shade');
      const d = WELL_R * 2 + 1;
      place(shade, SLOT_PX / 2 - d / 2, SLOT_PX / 2 - d / 2, d, d);
      const key = img(digits(HOTBAR_KEYS[skill].label, 'GOLD'), 7, 9);
      place(key, 2, 2);
      const label = el('span', 'ui-text ui-small ui-slot-label');
      label.textContent = t(`skillShort.${skill}` as MessageKey);
      place(label, -1, SLOT_PX, UI.slotPitch, UI.labelH);
      slot.append(frame, icon, shade, key, label);
      this.hotbar.append(slot);
      this.slots.set(skill, { frame, shade, state: 'ready', rejectedUntil: 0 });
    });

    this.deadEl = el('div', 'ui-text ui-dead');
    this.deadEl.textContent = t('dead');
    root.append(player, this.hotbar, this.deadEl);

    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** Integer UI scale + pixel-aligned centering (no half pixels, which would blur NEAREST art). */
  private layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const u = uiPixelSize(window.innerWidth, window.innerHeight, dpr);
    document.documentElement.style.setProperty('--u', `${u}px`);
    const center = (wUi: number): string => `${Math.round((window.innerWidth * dpr - wUi * u * dpr) / 2) / dpr}px`;
    const barW = HOTBAR.length * UI.slotPitch - (UI.slotPitch - SLOT_PX);
    this.hotbar.style.left = center(barW);
    this.hotbar.style.width = `${barW * u}px`;
    if (this.target) this.target.root.style.left = center(UI.target.w);
  }

  /** Paints the hero's face into the portrait from a frame of the character atlas. */
  setPortrait(image: CanvasImageSource, frame: { x: number; y: number; w: number; h: number }, pivotY: number): void {
    const size = UI.portrait;
    paintPortrait(this.portrait.getContext('2d')!, size, (ctx) => {
      // Head and shoulders: the top of a standing 64 px frame, centered.
      const crop = Math.round(size * 0.85);
      const top = Math.max(0, pivotY - 58);
      ctx.drawImage(image, frame.x + (frame.w - crop) / 2, frame.y + top, crop, crop, (size - crop) / 2, 4, crop, crop);
    });
  }

  private write(key: string, value: string, apply: (v: string) => void): void {
    if (this.written.get(key) === value) return;
    this.written.set(key, value);
    apply(value);
  }

  update(s: HudState): void {
    this.hpBar.set(s.hp, s.maxHp, true);
    this.resBar.set(s.resource, s.resourceMax, true);
    this.write('dead', s.dead ? 'block' : 'none', (v) => (this.deadEl.style.display = v));
    const now = performance.now();
    for (const [skill, slot] of this.slots) {
      const k = s.cooldown[skill] ?? 0;
      // Cooldown: INK 60% wedge sweeping clockwise over the icon well (Art Bible 9.2).
      this.write(`cd:${skill}`, k > 0 ? `conic-gradient(var(--shade) 0turn ${(1 - k).toFixed(3)}turn, transparent 0)` : 'none', (v) => (slot.shade.style.background = v));
      const state: SlotState = now < slot.rejectedUntil ? 'rejected' : k > 0 ? 'cooling' : 'ready';
      if (state !== slot.state) {
        slot.state = state;
        slot.frame.src = slotFrame(state);
      }
    }
  }

  /** Locked target panel (soft lock, GDD 4.3); null hides it. */
  updateTarget(target: HudTarget | null): void {
    const v = target ? (this.target ??= this.buildTarget()) : this.target;
    if (!v) return;
    this.write('target', target ? 'block' : 'none', (d) => (v.root.style.display = d));
    if (!target) return;
    this.write('targetName', target.name, (n) => (v.name.textContent = n));
    this.write('targetLevel', target.level === null ? '' : t('level', { n: target.level }), (n) => (v.level.textContent = n));
    this.write('targetGem', target.element ?? '', (e) => {
      v.gem.style.display = e ? 'block' : 'none';
      if (e) v.gem.src = elementGem(e as Element, 9);
      // Placeholder portrait: the element gem until monster portraits exist (tracker U-03).
      paintPortrait(v.portrait.getContext('2d')!, UI.targetPortrait, e ? (ctx) => paintGem(ctx, e as Element, 17, 7, 7) : null);
    });
    v.bar.set(target.hp, target.maxHp, true);
  }

  private buildTarget(): NonNullable<Hud['target']> {
    const root = box('ui-target hud-target', 0, UI.margin, UI.target.w, UI.targetPortrait + 2);
    const portrait = canvas(UI.targetPortrait, UI.targetPortrait);
    place(portrait, 0, 0);
    const name = el('span', 'ui-text ui-name');
    place(name, UI.target.barX + 12, 1);
    const level = el('span', 'ui-text ui-small');
    place(level, UI.target.barX + 2, UI.target.barY + 12);
    const gem = img(elementGem('fire', 9), 9, 9);
    place(gem, UI.target.barX, 4);
    const bar = new BarView(UI.target.barW, UI.bars.h, BAR_HP, null);
    place(bar.el, UI.target.barX - 6, UI.target.barY);
    root.append(bar.el, portrait, name, level, gem);
    this.root.append(root);
    this.target = { root, name, level, gem, bar, portrait };
    this.layout();
    return this.target;
  }

  /** Red slot frame for a moment when the server rejected the cast. */
  flash(skill: HotbarSkill): void {
    const slot = this.slots.get(skill);
    if (slot) slot.rejectedUntil = performance.now() + 300;
  }
}

/** One framed bar canvas: fill + bitmap "hp/max" digits + optional vector label. */
class BarView {
  readonly el: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D;
  private last = '';

  constructor(private readonly w: number, private readonly h: number, private readonly style: BarStyle, label: string | null) {
    const total = w + barTail(h, style);
    this.el = el('div', 'ui-bar');
    this.el.style.width = `calc(var(--u) * ${total})`;
    this.el.style.height = `calc(var(--u) * ${h})`;
    const c = canvas(total, h);
    place(c, 0, 0);
    this.ctx = c.getContext('2d')!;
    this.el.append(c);
    if (label) {
      const span = el('span', 'ui-text ui-bar-label');
      span.textContent = label;
      place(span, 4, 0, undefined, h);
      this.el.append(span);
    }
  }

  set(value: number, max: number, showDigits: boolean): void {
    const key = `${value}/${max}`;
    if (key === this.last) return;
    this.last = key;
    paintBar(this.ctx, this.w, this.h, max > 0 ? value / max : 0, this.style);
    if (showDigits && this.h >= 9) {
      const text = `${Math.max(0, Math.round(value))}/${max}`;
      drawDigits(this.ctx, text, this.w - 2 - textWidth(text), Math.floor((this.h - 7) / 2), color('CREAM').hex, color('INK').hex);
    }
  }
}

// ---------------------------------------------------------------- DOM helpers (sizes in UI pixels)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function place(e: HTMLElement, x: number, y: number, w?: number, h?: number): void {
  e.style.left = `calc(var(--u) * ${x})`;
  e.style.top = `calc(var(--u) * ${y})`;
  if (w !== undefined) e.style.width = `calc(var(--u) * ${w})`;
  if (h !== undefined) e.style.height = `calc(var(--u) * ${h})`;
}

function box(cls: string, x: number, y: number, w: number, h: number): HTMLDivElement {
  const b = el('div', cls);
  place(b, x, y, w, h);
  return b;
}

function img(src: string, w: number, h: number): HTMLImageElement {
  const i = el('img', 'ui-px');
  i.src = src;
  i.alt = '';
  i.style.width = `calc(var(--u) * ${w})`;
  i.style.height = `calc(var(--u) * ${h})`;
  return i;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = el('canvas', 'ui-px');
  c.width = w;
  c.height = h;
  c.style.width = `calc(var(--u) * ${w})`;
  c.style.height = `calc(var(--u) * ${h})`;
  return c;
}
