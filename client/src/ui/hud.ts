import { HOTBAR, type HotbarSkill } from '@aranya/shared';
import { t } from '../i18n.ts';

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

/**
 * Minimal DOM HUD: HP + ปราณดาบ bars and the 7-slot hotbar with cooldown
 * overlays. Placeholder for the pixel UI kit (tracker U-03, U-05).
 */
export class Hud {
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly resFill: HTMLDivElement;
  private readonly deadEl: HTMLDivElement;
  private readonly slots = new Map<HotbarSkill, { el: HTMLDivElement; shade: HTMLDivElement }>();

  constructor(root: HTMLElement) {
    root.innerHTML = '';
    const bars = el('div', 'hud-bars');
    const hp = bar(t('hp'), 'hp');
    const res = bar(t('resource'), 'res');
    this.hpFill = hp.fill;
    this.hpText = hp.text;
    this.resFill = res.fill;
    bars.append(hp.row, res.row);

    const hotbar = el('div', 'hud-hotbar');
    for (const skill of HOTBAR) {
      const slot = el('div', 'hud-slot');
      slot.title = t(`skill.${skill}`);
      const name = el('span', 'hud-slot-name');
      name.textContent = t(`skill.${skill}`);
      const key = el('span', 'hud-slot-key');
      key.textContent = HOTBAR_KEYS[skill].label;
      const shade = el('div', 'hud-slot-shade');
      slot.append(name, key, shade);
      hotbar.append(slot);
      this.slots.set(skill, { el: slot, shade });
    }

    this.deadEl = el('div', 'hud-dead');
    this.deadEl.textContent = t('dead');
    root.append(bars, hotbar, this.deadEl);
  }

  /** Last values written, so the DOM is only touched when something changed (no per-frame layout). */
  private readonly written = new Map<string, string>();

  private write(key: string, value: string, apply: (v: string) => void): void {
    if (this.written.get(key) === value) return;
    this.written.set(key, value);
    apply(value);
  }

  update(s: HudState): void {
    this.write('hp', `${(100 * s.hp) / Math.max(1, s.maxHp)}%`, (v) => (this.hpFill.style.width = v));
    this.write('hpText', `${s.hp}/${s.maxHp}`, (v) => (this.hpText.textContent = v));
    this.write('res', `${(100 * s.resource) / s.resourceMax}%`, (v) => (this.resFill.style.width = v));
    this.write('dead', s.dead ? 'block' : 'none', (v) => (this.deadEl.style.display = v));
    for (const [skill, slot] of this.slots) {
      const k = s.cooldown[skill] ?? 0;
      this.write(`cd:${skill}`, `${Math.round(k * 100)}%`, (v) => (slot.shade.style.height = v));
      this.write(`ready:${skill}`, String(k === 0), (v) => slot.el.classList.toggle('ready', v === 'true'));
    }
  }

  private targetEl: HTMLDivElement | null = null;

  /** Locked target panel (soft lock, GDD 4.3); null hides it. */
  updateTarget(target: { name: string; hp: number; maxHp: number } | null): void {
    if (!this.targetEl) {
      this.targetEl = el('div', 'hud-target');
      const name = el('span', 'hud-target-name');
      const t = bar('', 'target');
      this.targetEl.append(name, t.row);
      document.body.append(this.targetEl);
    }
    const root = this.targetEl;
    this.write('target', target ? `${target.name}|${target.hp}|${target.maxHp}` : '', () => {
      root.style.display = target ? 'flex' : 'none';
      if (!target) return;
      (root.querySelector('.hud-target-name') as HTMLElement).textContent = target.name;
      (root.querySelector('.hud-bar-fill') as HTMLElement).style.width = `${(100 * target.hp) / Math.max(1, target.maxHp)}%`;
      (root.querySelector('.hud-bar-text') as HTMLElement).textContent = `${target.hp}/${target.maxHp}`;
    });
  }

  /** Brief red flash on a slot when the server rejected the cast. */
  flash(skill: HotbarSkill): void {
    const slot = this.slots.get(skill)?.el;
    if (!slot) return;
    slot.classList.remove('rejected');
    void slot.offsetWidth;
    slot.classList.add('rejected');
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function bar(label: string, kind: string): { row: HTMLDivElement; fill: HTMLDivElement; text: HTMLSpanElement } {
  const row = el('div', `hud-bar hud-bar-${kind}`);
  const name = el('span', 'hud-bar-label');
  name.textContent = label;
  const track = el('div', 'hud-bar-track');
  const fill = el('div', 'hud-bar-fill');
  track.append(fill);
  const text = el('span', 'hud-bar-text');
  row.append(name, track, text);
  return { row, fill, text };
}
