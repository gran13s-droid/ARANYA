import { Room, type Client } from '@colyseus/core';
import {
  DEFAULT_LEVEL,
  Msg,
  TICK_MS,
  createRng,
  isLevelId,
  levelCollision,
  levelFile,
  parseCast,
  parseInput,
  stepMotion,
  type Element,
  type Level,
  type LevelId,
} from '@aranya/shared';
import { InputQueue } from '../inputQueue.ts';
import { PlayerState, TargetState, ZoneState } from '../state.ts';
import { CombatWorld, type CombatPlayer } from '../systems/combat.ts';

/** Per-player network bookkeeping; gameplay state lives in CombatPlayer. */
interface PlayerSim {
  combat: CombatPlayer;
  lastSeq: number;
  inputs: InputQueue;
  state: PlayerState;
}

const PING_EVERY_MS = 2000;
/** Most ticks run in one go after a stall; beyond that the simulation slows down instead of spiraling. */
const MAX_CATCHUP_TICKS = 5;
/** Weight of a new RTT sample in the moving average. */
const RTT_SMOOTHING = 0.25;

/** Options a client passes to joinOrCreate; rooms are filtered by level, so each level has its own channels. */
export interface ZoneRoomOptions {
  level?: string;
  /** Dev server only (`--dev`): start at this area's entry point (client `?at=<area>`). */
  at?: string;
}

/** `pnpm dev` and the e2e server pass --dev; production never honours client start points. */
const DEV_SERVER = process.argv.includes('--dev');

/**
 * One channel of a zone (CLAUDE.md: 1 room = 1 channel, ~80 players).
 * Clients send intents only: movement (+ dodge/lunge) every tick and casts on
 * key press. Movement uses the shared stepMotion(); combat decisions are made
 * by CombatWorld; both run at a fixed 20 Hz.
 */
export class ZoneRoom extends Room<{ state: ZoneState }> {
  override maxClients = 80;
  /** Flood guard: a client normally sends ~20-25 messages/s; far above that is disconnected (default is unlimited). */
  override maxMessagesPerSecond = 60;

  private levelId: LevelId = DEFAULT_LEVEL;
  private level!: Level;
  private readonly sims = new Map<string, PlayerSim>();
  private combat!: CombatWorld;
  private readonly targetStates = new Map<string, TargetState>();

  override onCreate(options: ZoneRoomOptions = {}): void {
    // Unknown level ids fall back to the default zone instead of failing the join.
    this.levelId = isLevelId(options.level) ? options.level : DEFAULT_LEVEL;
    this.level = levelCollision(this.levelId);
    const file = levelFile(this.levelId);
    void this.setMetadata({ level: this.levelId });
    this.state = new ZoneState();
    this.patchRate = TICK_MS;

    const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    this.combat = new CombatWorld(this.level, createRng(seed), { now: () => this.clock.currentTime, setTimeout: (cb, ms) => this.clock.setTimeout(cb, ms) }, {
      ack: (id, ack) => this.clients.getById(id)?.send(Msg.CastAck, ack),
      castStarted: (evt) => this.broadcast(Msg.CastStarted, evt, { except: this.clients.getById(evt.id) ?? undefined }),
      hits: (evts) => this.broadcast(Msg.Hits, evts),
      telegraph: (evt) => this.broadcast(Msg.Telegraph, evt),
      projectile: (evt) => this.broadcast(Msg.Projectile, evt),
      projectileEnd: (evt) => this.broadcast(Msg.ProjectileEnd, evt),
    });
    console.log(`[zone] ${this.roomId} level ${this.levelId}, combat rng seed ${seed}`);

    // Training dummies and monster spawns come from the level file (shared/src/levels).
    for (const d of file.dummies) {
      this.combat.addTarget({
        id: d.id,
        kind: d.sparring ? 'sparring' : 'dummy',
        pos: { x: d.x, y: d.y, z: d.z },
        elements: d.cursed ? [d.element, 'dark'].filter((e, i, a) => a.indexOf(e) === i) as Element[] : [d.element],
        maxHp: 2000,
        def: 30,
        atk: d.sparring ? 40 : 0,
        cursed: d.cursed === true,
      });
      const s = new TargetState();
      s.kind = d.sparring ? 'sparring' : 'dummy';
      s.element = d.element;
      this.state.targets.set(d.id, s);
      this.targetStates.set(d.id, s);
    }

    for (const m of file.spawns) {
      const t = this.combat.addMonster(m.id, m.species, { x: m.x, y: m.y, z: m.z });
      const s = new TargetState();
      s.kind = 'monster';
      s.species = m.species;
      s.element = t.elements[0] ?? 'fire';
      this.state.targets.set(m.id, s);
      this.targetStates.set(m.id, s);
    }

    this.onMessage(Msg.Input, (client: Client, payload: unknown) => {
      const input = parseInput(payload);
      if (!input) return;
      this.sims.get(client.sessionId)?.inputs.push(input);
    });
    this.onMessage(Msg.Cast, (client: Client, payload: unknown) => {
      const cast = parseCast(payload);
      if (cast) this.combat.cast(client.sessionId, cast);
    });
    this.onMessage(Msg.Pong, (client: Client, payload: unknown) => {
      const sim = this.sims.get(client.sessionId);
      const sent = typeof payload === 'object' && payload !== null ? (payload as { t?: unknown }).t : undefined;
      if (!sim || typeof sent !== 'number') return;
      const rtt = this.clock.currentTime - sent;
      if (rtt < 0 || rtt > 5000) return;
      sim.combat.rttMs = sim.combat.rttMs === 0 ? rtt : sim.combat.rttMs + (rtt - sim.combat.rttMs) * RTT_SMOOTHING;
    });

    // Fixed timestep with catch-up: under CPU load the interval fires late, so run as
    // many 50 ms ticks as real time requires. Otherwise the input rate limit (1 per
    // tick) would fall behind the client's 20 Hz input stream and drop inputs.
    let accumulator = 0;
    this.setSimulationInterval((deltaMs) => {
      accumulator = Math.min(accumulator + deltaMs, TICK_MS * MAX_CATCHUP_TICKS);
      while (accumulator >= TICK_MS) {
        accumulator -= TICK_MS;
        this.tick();
      }
    }, TICK_MS);
    this.clock.setInterval(() => this.broadcast(Msg.Ping, { t: this.clock.currentTime }), PING_EVERY_MS);
  }

  override onJoin(client: Client, options: ZoneRoomOptions = {}): void {
    const entry = DEV_SERVER && options.at ? levelFile(this.levelId).areas.find((a) => a.id === options.at)?.entry : undefined;
    // Spread joiners along a short line at the spawn point (kept clear of obstacles).
    const spawn = entry ? { ...entry } : { ...this.level.spawn, x: this.level.spawn.x + ((this.sims.size % 5) - 2) * 1.5 };
    const combat = this.combat.addPlayer(client.sessionId, spawn);
    const state = new PlayerState();
    this.state.players.set(client.sessionId, state);
    const sim = { combat, lastSeq: 0, inputs: new InputQueue(), state };
    this.sims.set(client.sessionId, sim);
    this.syncPlayer(sim);
  }

  override onLeave(client: Client): void {
    this.sims.delete(client.sessionId);
    this.combat.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private tick(): void {
    for (const sim of this.sims.values()) {
      for (const input of sim.inputs.drain()) {
        // Dead players still consume inputs (so prediction stays acknowledged) but cannot move.
        const intent = sim.combat.dead ? { mx: 0 as const, mz: 0 as const } : input;
        sim.combat.motion = stepMotion(this.level, sim.combat.motion, intent);
        sim.lastSeq = input.seq;
      }
    }
    this.combat.tick(this.level.spawn);
    for (const sim of this.sims.values()) this.syncPlayer(sim);
    for (const [id, s] of this.targetStates) {
      const t = this.combat.targets.get(id);
      if (!t) continue;
      s.x = t.pos.x;
      s.y = t.pos.y;
      s.z = t.pos.z;
      s.fx = t.fx;
      s.fz = t.fz;
      s.hp = t.hp;
      s.maxHp = t.maxHp;
      s.stunned = this.clock.currentTime < t.stunnedUntil;
    }
  }

  private syncPlayer(sim: PlayerSim): void {
    const { motion: m, hp, maxHp, resource, dead } = sim.combat;
    const s = sim.state;
    s.x = m.x;
    s.y = m.y;
    s.z = m.z;
    s.fx = m.fx;
    s.fz = m.fz;
    s.dashKind = m.dashKind;
    s.dashTicks = m.dashTicks;
    s.dodgeCdTicks = m.dodgeCdTicks;
    s.lungeCdTicks = m.lungeCdTicks;
    s.speedMul = m.speedMul;
    s.lastSeq = sim.lastSeq;
    s.hp = hp;
    s.maxHp = maxHp;
    s.resource = resource;
    s.dead = dead;
  }
}
