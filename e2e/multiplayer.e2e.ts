import { afterEach, describe, expect, inject, it } from 'vitest';
import { Msg, RUN_SPEED, TICK_DT, TICK_MS, type CastAck, type HitEvent } from '@aranya/shared';
import { joinZone, playerOf, sleep, waitFor, type NetTarget, type ZoneRoom } from './helpers.ts';

const serverUrl = inject('serverUrl');
const rooms: ZoneRoom[] = [];

async function join(): Promise<ZoneRoom> {
  const room = await joinZone(serverUrl);
  rooms.push(room);
  await waitFor(() => playerOf(room) !== undefined, 5000, 'own player in state');
  return room;
}

afterEach(async () => {
  await Promise.allSettled(rooms.splice(0).map((r) => (r.connection.isOpen ? r.leave() : undefined)));
});

describe('zone room (real server, headless clients)', () => {
  it('puts two clients in the same channel and syncs server-authoritative movement', async () => {
    const a = await join();
    const b = await join();
    expect(a.roomId).toBe(b.roomId);
    await waitFor(() => playerOf(b, a.sessionId) !== undefined, 5000, 'B sees A');

    const startZ = playerOf(a)!.z;
    const ticks = 40;
    for (let seq = 1; seq <= ticks; seq++) {
      a.send(Msg.Input, { seq, mx: 0, mz: 1 });
      await sleep(TICK_MS);
    }
    await waitFor(() => playerOf(a)!.lastSeq === ticks, 5000, 'server ack of last input');

    const expected = startZ + ticks * RUN_SPEED * TICK_DT;
    expect(playerOf(a)!.z).toBeCloseTo(expected, 3);
    await waitFor(() => Math.abs(playerOf(b, a.sessionId)!.z - expected) < 1e-3, 2000, 'B sees final position');
  });

  it('ignores invalid inputs without disconnecting the sender', async () => {
    const a = await join();
    a.send(Msg.Input, { seq: 1, mx: 5, mz: 0 });
    a.send(Msg.Input, 'garbage');
    a.send(Msg.Input, { seq: 2 ** 40, mx: 0, mz: 1 });
    a.send(Msg.Input, { seq: -1, mx: 0, mz: 1 });
    await sleep(300);
    expect(a.connection.isOpen).toBe(true);
    expect(playerOf(a)!.lastSeq).toBe(0);
  });

  it('disconnects a flooding client and never lets it move faster than the tick rate', async () => {
    const cheater = await join();
    const watcher = await join();
    const startZ = playerOf(cheater)!.z;

    for (let seq = 1; seq <= 200; seq++) cheater.send(Msg.Input, { seq, mx: 0, mz: 1 });
    await waitFor(() => !cheater.connection.isOpen, 3000, 'flooder disconnected');

    const seen = playerOf(watcher, cheater.sessionId);
    if (seen) {
      // At most the queue cap could have been applied before the kick.
      expect(seen.z - startZ).toBeLessThanOrEqual(10 * RUN_SPEED * TICK_DT + 1e-6);
    }
    await waitFor(() => playerOf(watcher, cheater.sessionId) === undefined, 3000, 'flooder removed');
    expect(watcher.connection.isOpen).toBe(true);
  });

  it('resolves a sword swing on the server: dummy HP drops and everyone gets the hit', async () => {
    const a = await join();
    const watcher = await join();
    const hitsSeen: HitEvent[] = [];
    watcher.onMessage(Msg.Hits, (h: HitEvent[]) => hitsSeen.push(...h));
    const acks: CastAck[] = [];
    a.onMessage(Msg.CastAck, (ack: CastAck) => acks.push(ack));

    // Walk south from the spawn line until right in front of the dummies (z = -14).
    const start = playerOf(a)!;
    let seq = 1;
    while (playerOf(a)!.z > -12.5) {
      a.send(Msg.Input, { seq: seq++, mx: 0, mz: -1 });
      await sleep(TICK_MS);
    }
    for (let i = 0; i < 4; i++) {
      a.send(Msg.Input, { seq: seq++, mx: 0, mz: 0 });
      await sleep(TICK_MS);
    }
    const nearest = [...(a.state.targets as Map<string, NetTarget>).entries()].sort(
      ([, p], [, q]) => Math.hypot(p.x - start.x, p.z + 14) - Math.hypot(q.x - start.x, q.z + 14),
    )[0]!;

    a.send(Msg.Cast, { seq: 1, skill: 'attack', fx: 0, fz: -1 });
    await waitFor(() => acks.length === 1, 3000, 'cast ack');
    expect(acks[0]).toMatchObject({ ok: true, comboStep: 1 });
    await waitFor(() => hitsSeen.some((h) => h.target === nearest[0] && h.kind === 'damage'), 3000, 'hit event');
    await waitFor(() => (a.state.targets as Map<string, NetTarget>).get(nearest[0])!.hp < nearest[1].maxHp, 3000, 'dummy HP drop');
  });

  it('rejects casts the server does not allow and ignores malformed ones', async () => {
    const a = await join();
    const acks: CastAck[] = [];
    a.onMessage(Msg.CastAck, (ack: CastAck) => acks.push(ack));
    a.send(Msg.Cast, { seq: 1, skill: 'ultimate', fx: 0, fz: 1 }); // no ปราณดาบ yet
    a.send(Msg.Cast, { seq: 2, skill: 'fly', fx: 0, fz: 1 });
    a.send(Msg.Cast, 'garbage');
    await waitFor(() => acks.length >= 1, 3000, 'ack');
    await sleep(200);
    expect(acks).toEqual([{ seq: 1, skill: 'ultimate', ok: false, reason: 'resource' }]);
    expect(a.connection.isOpen).toBe(true);
  });

  it('removes a player from everyone else when they leave', async () => {
    const a = await join();
    const b = await join();
    await waitFor(() => playerOf(b, a.sessionId) !== undefined, 5000, 'B sees A');
    await a.leave();
    await waitFor(() => playerOf(b, a.sessionId) === undefined, 3000, 'A removed for B');
  });
});
