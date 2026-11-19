import { describe, expect, it } from 'vitest';
import { MotionAct, SPIKE_LEVEL, SWORDSMAN, initialMotion, stepMotion } from '@aranya/shared';
import { PredictedPlayer } from './prediction.ts';

const start = initialMotion({ x: 0, y: 0, z: -6 });

describe('PredictedPlayer', () => {
  it('moves immediately without waiting for the server', () => {
    const p = new PredictedPlayer(SPIKE_LEVEL, start);
    p.applyLocal(0, 1);
    expect(p.current.z).toBeGreaterThan(start.z);
  });

  it('ends at the same state as the server when the server agrees', () => {
    const p = new PredictedPlayer(SPIKE_LEVEL, start);
    const sent = [p.applyLocal(1, 0), p.applyLocal(1, 1, MotionAct.Dodge), p.applyLocal(0, 1)];
    // Server has processed only the first input so far.
    const server = stepMotion(SPIKE_LEVEL, start, sent[0]!);
    const predictedBefore = p.current;
    p.reconcile(server, sent[0]!.seq);
    expect(p.current).toEqual(predictedBefore);
    expect(p.pendingCount).toBe(2);
  });

  it('predicts a dodge exactly like the server (distance and cooldown)', () => {
    const p = new PredictedPlayer(SPIKE_LEVEL, start);
    p.applyLocal(1, 0, MotionAct.Dodge);
    for (let i = 0; i < 6; i++) p.applyLocal(0, 0);
    expect(p.current.x - start.x).toBeCloseTo(SWORDSMAN.dodge.distance);
    expect(p.current.dodgeCdTicks).toBeGreaterThan(0);
  });

  it('corrects to the server when the server disagrees', () => {
    const p = new PredictedPlayer(SPIKE_LEVEL, start);
    const last = p.applyLocal(0, 1);
    const server = { ...start, x: 3 };
    p.reconcile(server, last.seq);
    expect(p.current).toEqual(server);
    expect(p.pendingCount).toBe(0);
  });
});
