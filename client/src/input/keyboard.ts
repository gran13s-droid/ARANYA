import type { Axis } from '@aranya/shared';

/**
 * Keyboard state. Uses KeyboardEvent.code (physical key position), so it
 * works the same with a Thai keyboard layout active.
 */
export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
    });
  }

  private held(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** Movement intent: +mx = east (D), +mz = north (W); the camera always looks north. */
  axes(): { mx: Axis; mz: Axis } {
    const mx = (Number(this.held('KeyD', 'ArrowRight')) - Number(this.held('KeyA', 'ArrowLeft'))) as Axis;
    const mz = (Number(this.held('KeyW', 'ArrowUp')) - Number(this.held('KeyS', 'ArrowDown'))) as Axis;
    return { mx, mz };
  }

  /** True once per physical press (edge-triggered), then cleared. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }
}
