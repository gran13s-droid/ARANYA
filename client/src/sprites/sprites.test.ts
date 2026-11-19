import { describe, expect, it } from 'vitest';
import { DRAWN_DIRS, PLAYER_ANIMS, type AtlasJson } from '@aranya/shared';
import { CharacterAnimator } from './animator.ts';
import { facingFromMove, toDrawn } from './facing.ts';

/** Minimal atlas with every player animation, evenly timed like the pipeline output. */
function fakeAtlas(): AtlasJson {
  const animations: AtlasJson['animations'] = {};
  const frames: AtlasJson['frames'] = {};
  for (const [anim, spec] of Object.entries(PLAYER_ANIMS)) {
    for (const dir of DRAWN_DIRS) {
      const keys = Array.from({ length: spec.frames }, (_, i) => `${anim}_${dir}_${i}`);
      for (const k of keys) frames[k] = { frame: { x: 0, y: 0, w: 64, h: 64 } };
      animations[`${anim}_${dir}`] = {
        frames: keys,
        durations: keys.map(() => spec.durationMs / spec.frames),
        loop: spec.loop,
        holdLast: 'holdLast' in spec,
      };
    }
  }
  return { frames, animations, meta: { image: 'x.png', size: { w: 64, h: 64 }, frameSize: { w: 64, h: 64 }, pivot: { x: 32, y: 62 } } };
}

describe('facingFromMove', () => {
  it.each([
    [1, 0, 'E'],
    [-1, 0, 'W'],
    [0, 1, 'N'],
    [0, -1, 'S'],
  ] as const)('(%i, %i) faces %s', (dx, dz, expected) => {
    expect(facingFromMove(dx, dz, 'S')).toBe(expected);
  });

  it('keeps the previous facing when standing still', () => {
    expect(facingFromMove(0, 0, 'W')).toBe('W');
  });

  it('keeps a matching facing on diagonals (no flicker) and prefers the side view otherwise', () => {
    expect(facingFromMove(1, 1, 'N')).toBe('N');
    expect(facingFromMove(1, 1, 'E')).toBe('E');
    expect(facingFromMove(1, 1, 'S')).toBe('E');
  });

  it('draws W as mirrored E (4 facings from 3 drawn directions)', () => {
    expect(toDrawn('W')).toEqual({ dir: 'E', mirror: true });
    expect(toDrawn('E')).toEqual({ dir: 'E', mirror: false });
    expect(toDrawn('N')).toEqual({ dir: 'N', mirror: false });
  });
});

describe('CharacterAnimator', () => {
  it('switches idle -> walk -> run with speed', () => {
    const a = new CharacterAnimator(fakeAtlas());
    expect(a.current).toBe('idle');
    a.setSpeed(1.5);
    expect(a.current).toBe('walk');
    a.setSpeed(5);
    expect(a.current).toBe('run');
    a.setSpeed(0);
    expect(a.current).toBe('idle');
  });

  it('loops locomotion frames over time', () => {
    const a = new CharacterAnimator(fakeAtlas());
    a.setSpeed(5);
    const step = PLAYER_ANIMS.run.durationMs / PLAYER_ANIMS.run.frames;
    a.update(step * 2 + 1);
    expect(a.frame().key).toBe('run_S_2');
    a.update(PLAYER_ANIMS.run.durationMs);
    expect(a.frame().key).toBe('run_S_2');
  });

  it('plays an attack once and returns to locomotion', () => {
    const a = new CharacterAnimator(fakeAtlas());
    a.setSpeed(5);
    a.play('attack1');
    a.setSpeed(5); // movement must not cancel the attack
    expect(a.current).toBe('attack1');
    a.update(PLAYER_ANIMS.attack1.durationMs + 1);
    expect(a.current).toBe('run');
  });

  it('holds the last death frame and ignores further actions until revived', () => {
    const a = new CharacterAnimator(fakeAtlas());
    a.play('death');
    a.update(10_000);
    expect(a.frame().key).toBe(`death_S_${PLAYER_ANIMS.death.frames - 1}`);
    a.play('attack1');
    expect(a.current).toBe('death');
    a.revive();
    expect(a.current).toBe('idle');
  });

  it('mirrors the east frames when facing west', () => {
    const a = new CharacterAnimator(fakeAtlas());
    a.facing = 'W';
    expect(a.frame()).toEqual({ key: 'idle_E_0', mirror: true });
  });
});
