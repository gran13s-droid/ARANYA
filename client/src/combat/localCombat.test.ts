import { describe, expect, it } from 'vitest';
import { SWORDSMAN, type CastMessage } from '@aranya/shared';
import { LocalCombat } from './localCombat.ts';

function setup() {
  const sent: CastMessage[] = [];
  const rejected: string[] = [];
  const combat = new LocalCombat((m) => sent.push(m), (s) => rejected.push(s));
  return { combat, sent, rejected };
}

const aim = { fx: 0, fz: 1 };

describe('LocalCombat', () => {
  it('sends an intent only (skill + aim), never damage or position', () => {
    const { combat, sent } = setup();
    combat.tryCast('attack', aim, 0, null, 0);
    expect(sent).toEqual([{ seq: 1, skill: 'attack', fx: 0, fz: 1 }]);
  });

  it('does not spam casts while the swing is playing', () => {
    const { combat, sent } = setup();
    combat.tryCast('attack', aim, 0, null, 0);
    expect(combat.tryCast('attack', aim, 0, null, 100)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('starts the cooldown only when the server accepts', () => {
    const { combat } = setup();
    combat.tryCast('stance', aim, 0, null, 0);
    expect(combat.cooldownFraction('stance', 10)).toBe(0);
    combat.onAck({ seq: 1, skill: 'stance', ok: true, cooldownMs: SWORDSMAN.stance.cooldownMs }, null, 10);
    expect(combat.cooldownFraction('stance', 10)).toBeCloseTo(1);
    expect(combat.cooldownFraction('stance', 10 + SWORDSMAN.stance.cooldownMs / 2)).toBeCloseTo(0.5);
  });

  it('frees the player again after a rejection', () => {
    const { combat, sent, rejected } = setup();
    combat.tryCast('attack', aim, 0, null, 0);
    combat.onAck({ seq: 1, skill: 'attack', ok: false, reason: 'busy' }, null, 50);
    expect(rejected).toEqual(['attack']);
    expect(combat.tryCast('attack', aim, 0, null, 60)).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('refuses the ultimate locally without enough ปราณดาบ', () => {
    const { combat, sent, rejected } = setup();
    expect(combat.tryCast('ultimate', aim, 40, null, 0)).toBe(false);
    expect(sent).toHaveLength(0);
    expect(rejected).toEqual(['ultimate']);
  });
});
