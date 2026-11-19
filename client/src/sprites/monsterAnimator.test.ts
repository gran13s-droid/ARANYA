import { describe, expect, it } from 'vitest';
import { DRAWN_DIRS, MONSTER_ANIMS, type AtlasJson } from '@aranya/shared';
import { MonsterAnimator } from './monsterAnimator.ts';

function fakeAtlas(): AtlasJson {
  const animations: AtlasJson['animations'] = {};
  const frames: AtlasJson['frames'] = {};
  for (const [anim, spec] of Object.entries(MONSTER_ANIMS)) {
    for (const dir of DRAWN_DIRS) {
      const keys = Array.from({ length: spec.frames }, (_, i) => `${anim}_${dir}_${i}`);
      for (const k of keys) frames[k] = { frame: { x: 0, y: 0, w: 48, h: 48 } };
      animations[`${anim}_${dir}`] = { frames: keys, durations: keys.map(() => spec.durationMs / spec.frames), loop: spec.loop, holdLast: 'holdLast' in spec };
    }
  }
  return { frames, animations, meta: { image: 'x.png', size: { w: 48, h: 48 }, frameSize: { w: 48, h: 48 }, pivot: { x: 24, y: 45 } } };
}

describe('MonsterAnimator', () => {
  it('idles, moves with speed, and mirrors E when facing W', () => {
    const a = new MonsterAnimator(fakeAtlas());
    expect(a.current).toBe('idle');
    a.setSpeed(2);
    expect(a.current).toBe('move');
    a.facing = 'W';
    expect(a.frame()).toEqual({ key: 'move_E_0', mirror: true });
  });

  it('holds attack frames 1-2 for the whole telegraph, then lands on frame 3', () => {
    const a = new MonsterAnimator(fakeAtlas());
    a.windup(1000);
    for (let t = 0; t < 900; t += 50) {
      a.update(50);
      expect(['attack_S_0', 'attack_S_1']).toContain(a.frame().key);
    }
    a.update(120); // telegraph ends: the hit lands
    expect(a.frame().key).toBe('attack_S_2');
    a.update(MONSTER_ANIMS.attack.durationMs);
    expect(a.current).toBe('idle');
  });

  it('flinches only when not busy, and purify holds its last frame until revived', () => {
    const a = new MonsterAnimator(fakeAtlas());
    a.windup(1000);
    a.hit();
    expect(a.current).toBe('attack');
    a.die();
    a.update(10_000);
    expect(a.deathFinished).toBe(true);
    expect(a.frame().key).toBe('death_S_4');
    a.revive();
    expect(a.current).toBe('idle');
    a.hit();
    expect(a.current).toBe('hit');
  });
});
