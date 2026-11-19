import {
  SWORDSMAN,
  actionLockMs,
  type CastAck,
  type CastMessage,
  type CastSkillId,
  type PlayerAnim,
} from '@aranya/shared';
import type { CharacterSprite } from '../sprites/characterLayer.ts';
import { facingFromMove } from '../sprites/facing.ts';

interface Pending {
  skill: CastSkillId;
  anim: PlayerAnim | null;
  comboStep: number;
}

/**
 * Local player's casts (ROADMAP 1.2: "play the animation immediately, then
 * fix it with what the server confirms"). It mirrors the server's busy /
 * combo / cooldown rules only to decide what to show; the server's CastAck is
 * the truth: rejections cancel the animation, a different combo step replaces it.
 */
export class LocalCombat {
  private seq = 1;
  private busyUntil = 0;
  private combo = { step: 0, endsAt: 0 };
  private readonly readyAt: Partial<Record<CastSkillId, number>> = {};
  private readonly cooldownMs: Partial<Record<CastSkillId, number>> = {};
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly send: (msg: CastMessage) => void,
    private readonly onRejected: (skill: CastSkillId) => void,
  ) {}

  /** Returns false (and sends nothing) when the local view already knows it would fail. */
  tryCast(skill: CastSkillId, aim: { fx: number; fz: number }, resource: number, sprite: CharacterSprite | null, now: number): boolean {
    if (now < this.busyUntil || now < (this.readyAt[skill] ?? 0)) return false;
    if (skill === 'ultimate' && resource < SWORDSMAN.ultimate.resourceCost) {
      this.onRejected(skill);
      return false;
    }

    let anim: PlayerAnim | null = null;
    let comboStep = 0;
    switch (skill) {
      case 'attack': {
        const combo = SWORDSMAN.attack.combo;
        const continues = this.combo.step > 0 && this.combo.step < combo.length && now <= this.combo.endsAt + SWORDSMAN.attack.comboWindowMs;
        comboStep = continues ? this.combo.step + 1 : 1;
        anim = combo[comboStep - 1]!.anim;
        this.combo = { step: comboStep, endsAt: now + actionLockMs(anim) };
        this.busyUntil = now + actionLockMs(anim);
        break;
      }
      case 'stance':
        anim = SWORDSMAN.stance.anim;
        this.busyUntil = now + actionLockMs(anim);
        break;
      case 'parry':
        anim = SWORDSMAN.parry.anim;
        this.busyUntil = now + SWORDSMAN.parry.windowMs;
        break;
      case 'ultimate':
        anim = SWORDSMAN.ultimate.anim;
        this.busyUntil = now + actionLockMs(anim);
        break;
      case 'potion':
        break;
    }

    if (anim && sprite) {
      sprite.animator.facing = facingFromMove(aim.fx, aim.fz, sprite.animator.facing);
      sprite.animator.play(anim as Exclude<PlayerAnim, 'idle' | 'walk' | 'run'>);
    }
    const seq = this.seq++;
    this.pending.set(seq, { skill, anim, comboStep });
    this.send({ seq, skill, fx: aim.fx, fz: aim.fz });
    return true;
  }

  onAck(ack: CastAck, sprite: CharacterSprite | null, now: number): void {
    const p = this.pending.get(ack.seq);
    this.pending.delete(ack.seq);
    if (!ack.ok) {
      if (p?.anim) sprite?.animator.cancel();
      if (ack.skill === 'attack') this.combo = { step: 0, endsAt: 0 };
      this.busyUntil = 0;
      this.onRejected(ack.skill);
      return;
    }
    if (ack.cooldownMs) {
      this.readyAt[ack.skill] = now + ack.cooldownMs;
      this.cooldownMs[ack.skill] = ack.cooldownMs;
    }
    // The server decided a different combo step (e.g. our window estimate was off): show that one.
    if (ack.skill === 'attack' && ack.comboStep && p && ack.comboStep !== p.comboStep) {
      const anim = SWORDSMAN.attack.combo[ack.comboStep - 1]!.anim;
      this.combo = { step: ack.comboStep, endsAt: now + actionLockMs(anim) };
      sprite?.animator.play(anim);
    }
  }

  /** Remaining cooldown as 0..1 for the hotbar. */
  cooldownFraction(skill: CastSkillId, now: number): number {
    const total = this.cooldownMs[skill];
    const ready = this.readyAt[skill];
    if (!total || !ready || now >= ready) return 0;
    return (ready - now) / total;
  }
}
