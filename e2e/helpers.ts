import { Client, type Room } from '@colyseus/sdk';
import { ZONE_ROOM } from '@aranya/shared';

export interface NetPlayer {
  x: number;
  y: number;
  z: number;
  lastSeq: number;
  hp: number;
}
export interface NetTarget {
  kind: string;
  species: string;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
}
export interface NetState {
  players: Map<string, NetPlayer> & { size: number };
  targets: Map<string, NetTarget>;
}
export type ZoneRoom = Room<unknown, NetState>;

export function joinZone(serverUrl: string): Promise<ZoneRoom> {
  return new Client(serverUrl).joinOrCreate<NetState>(ZONE_ROOM) as Promise<ZoneRoom>;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polls until `check` returns true, instead of relying on fixed sleeps. */
export async function waitFor(check: () => boolean, timeoutMs = 5000, label = 'condition'): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await sleep(20);
  }
}

/** The state is empty until the first full sync arrives, so every level may be missing. */
export function playerOf(room: ZoneRoom, sessionId = room.sessionId): NetPlayer | undefined {
  return (room.state as Partial<NetState> | undefined)?.players?.get(sessionId);
}
