import { Engine, PointerEventTypes, SceneInstrumentation } from '@babylonjs/core';
import { Client } from '@colyseus/sdk';
import {
  CAST_SKILLS,
  INTERPOLATION_DELAY_MS,
  LUNGE_CD_TICKS,
  MotionAct,
  Msg,
  SPIKE_LEVEL,
  SWORDSMAN_STATS,
  TICK_MS,
  ZONE_ROOM,
  hitDelayMs,
  type CastAck,
  type CastStarted,
  type HitEvent,
  type ProjectileEndEvent,
  type ProjectileEvent,
  type Motion,
  type TelegraphEvent,
  type Vec3,
} from '@aranya/shared';
import { LocalCombat } from './combat/localCombat.ts';
import { BotSwarm } from './dev/bots.ts';
import { DamageNumbers } from './fx/damageNumbers.ts';
import { Projectiles } from './fx/projectiles.ts';
import { PurifyBursts } from './fx/purify.ts';
import { Telegraphs } from './fx/telegraphs.ts';
import { SoftLock } from './combat/softLock.ts';
import { t, type MessageKey } from './i18n.ts';
import { Keyboard } from './input/keyboard.ts';
import { InterpolationBuffer } from './net/interpolation.ts';
import { PredictedPlayer } from './net/prediction.ts';
import { color, type PaletteName } from './palette.ts';
import { CharacterLayer, type CharacterSprite } from './sprites/characterLayer.ts';
import { facingFromMove } from './sprites/facing.ts';
import { loadAtlas } from './sprites/loadAtlas.ts';
import { DODGE_KEY, HOTBAR_KEYS, Hud } from './ui/hud.ts';
import { TargetViews, type NetTarget } from './world/targets.ts';
import { createWorld } from './world/world.ts';

/** Shape of a player entry in the synced room state (server/src/state.ts). */
interface NetPlayer extends Omit<Motion, 'dashKind'> {
  dashKind: number;
  lastSeq: number;
  hp: number;
  maxHp: number;
  resource: number;
  dead: boolean;
}
interface NetMap<T> {
  forEach(cb: (v: T, id: string) => void): void;
  get(id: string): T | undefined;
  size: number;
}
interface NetState {
  players: NetMap<NetPlayer>;
  targets: NetMap<NetTarget>;
}

const MAX_TICKS_PER_FRAME = 5;
const CHARACTER_ATLAS = 'chr_placeholder';
/** Holding the left mouse button this long starts continuous attacks (a shorter click only locks). */
const HOLD_TO_ATTACK_MS = 200;
/** Hit stop on the attacker when its hit is confirmed (ROADMAP 1.2). */
const HIT_STOP_MS = 70;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const hudEl = document.getElementById('hud') as HTMLDivElement;

// UI colors come from the palette file, never hard-coded hex (CLAUDE.md).
for (const name of ['INK', 'FOREST_DEEP', 'JADE', 'SPIRIT', 'GOLD', 'CREAM', 'FIRE', 'STONE'] as PaletteName[]) {
  document.documentElement.style.setProperty(`--c-${name.toLowerCase().replace('_', '-')}`, color(name).hex);
}

// Pixel art: no MSAA, render at device pixels so the integer pixel scale is exact.
const engine = new Engine(canvas, false, { antialias: false, stencil: true });
engine.setHardwareScalingLevel(1 / window.devicePixelRatio);

const level = SPIKE_LEVEL;
const world = createWorld(engine, level);
const keyboard = new Keyboard();
const instrumentation = new SceneInstrumentation(world.scene);
instrumentation.captureFrameTime = true;
const numbers = new DamageNumbers(world.scene);
const telegraphs = new Telegraphs(world.scene);
const targetViews = new TargetViews(world.scene);
const projectiles = new Projectiles(world.scene);
const purify = new PurifyBursts(world.scene);
const softLock = new SoftLock(world.scene, targetViews);
const hud = new Hud(hudEl);

/** Display name of a dummy or monster (i18n). */
function targetName(kind: string, species: string): string {
  if (kind === 'monster') return t(`monster.${species}` as MessageKey);
  return t(kind === 'sparring' ? 'target.sparring' : 'target.dummy');
}

const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  z: a.z + (b.z - a.z) * k,
});

const motionOf = (p: NetPlayer): Motion => ({
  x: p.x, y: p.y, z: p.z, fx: p.fx, fz: p.fz,
  dashKind: p.dashKind as Motion['dashKind'], dashTicks: p.dashTicks,
  dodgeCdTicks: p.dodgeCdTicks, lungeCdTicks: p.lungeCdTicks, speedMul: p.speedMul,
});

async function start(): Promise<void> {
  statusEl.textContent = t('connecting');
  const { atlas, imageUrl } = await loadAtlas(CHARACTER_ATLAS);
  const layer = new CharacterLayer(world.scene, level, atlas, imageUrl);

  const params = new URLSearchParams(location.search);
  const botCount = import.meta.env.DEV ? Math.min(Number(params.get('bots') ?? 0) || 0, layer.capacity - 16) : 0;
  const bots = botCount > 0 ? new BotSwarm(level, layer, botCount) : null;

  const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? `http://${location.hostname}:2567`;
  const room = await new Client(serverUrl).joinOrCreate<NetState>(ZONE_ROOM);
  const me = room.sessionId;

  let local: PredictedPlayer | null = null;
  let localSprite: CharacterSprite | null = null;
  let mine: NetPlayer | null = null;
  const remotes = new Map<string, { buffer: InterpolationBuffer; sprite: CharacterSprite; dead: boolean }>();
  let localDead = false;

  const combat = new LocalCombat((msg) => room.send(Msg.Cast, msg), (skill) => hud.flash(skill));
  /** Dev-only: recent cast acks for the e2e probe. */
  const ackLog: (CastAck & { t: number })[] = [];

  room.onMessage(Msg.Ping, (msg: unknown) => room.send(Msg.Pong, msg));
  room.onMessage(Msg.CastAck, (ack: CastAck) => {
    combat.onAck(ack, localSprite, performance.now());
    if (import.meta.env.DEV) ackLog.push({ ...ack, t: Math.round(performance.now()) });
    if (ack.ok && ack.skill === 'ultimate') setTimeout(() => world.shake(4, 250), hitDelayMs('skill'));
  });
  room.onMessage(Msg.CastStarted, (evt: CastStarted) => {
    const r = remotes.get(evt.id);
    if (!r) return;
    r.sprite.animator.facing = facingFromMove(evt.fx, evt.fz, r.sprite.animator.facing);
    if (evt.anim !== 'idle' && evt.anim !== 'walk' && evt.anim !== 'run') r.sprite.animator.play(evt.anim);
  });
  room.onMessage(Msg.Telegraph, (evt: TelegraphEvent) => telegraphs.show(evt));
  room.onMessage(Msg.Projectile, (evt: ProjectileEvent) => projectiles.spawn(evt));
  room.onMessage(Msg.ProjectileEnd, (evt: ProjectileEndEvent) => projectiles.end(evt));
  room.onMessage(Msg.Hits, (hits: HitEvent[]) => {
    for (const h of hits) {
      if (h.kind === 'death') {
        purify.show(h);
        continue;
      }
      // Each player only sees numbers for hits they dealt or took (Art Bible 7.6).
      if (h.source !== me && h.target !== me) {
        if (h.kind === 'damage') remotes.get(h.target)?.sprite.animator.play('hit');
        continue;
      }
      switch (h.kind) {
        case 'damage':
          if (h.target === me) {
            numbers.show(h, String(h.amount), 'FIRE');
            localSprite?.animator.play('hit');
            world.shake(2, 120);
          } else {
            numbers.show(h, String(h.amount), h.crit ? 'GOLD' : 'CREAM', h.crit);
            localSprite?.animator.freeze(HIT_STOP_MS);
            if (h.crit) world.shake(2, 100);
          }
          break;
        case 'burn':
          numbers.show(h, String(h.amount), 'EARTH' as PaletteName);
          break;
        case 'heal':
          numbers.show(h, `+${h.amount}`, 'JADE');
          break;
        case 'mana':
          numbers.show(h, `+${h.amount}`, 'GOLD');
          break;
        case 'parry':
          localSprite?.animator.freeze(120);
          world.shake(3, 150);
          break;
        case 'stun':
          localSprite?.animator.freeze(HIT_STOP_MS);
          break;
      }
    }
  });

  room.onStateChange((state) => {
    const now = performance.now();
    const seen = new Set<string>();
    state.players.forEach((p, id) => {
      seen.add(id);
      if (id === me) {
        mine = p;
        if (!local) {
          local = new PredictedPlayer(level, motionOf(p));
          localSprite = layer.spawn();
        } else {
          local.reconcile(motionOf(p), p.lastSeq);
        }
        if (p.dead !== localDead) {
          localDead = p.dead;
          if (p.dead) localSprite?.animator.play('death');
          else localSprite?.animator.revive();
        }
        return;
      }
      let remote = remotes.get(id);
      if (!remote) {
        remote = { buffer: new InterpolationBuffer(), sprite: layer.spawn(), dead: false };
        remotes.set(id, remote);
      }
      remote.buffer.push(now, { x: p.x, y: p.y, z: p.z });
      if (p.dead !== remote.dead) {
        remote.dead = p.dead;
        if (p.dead) remote.sprite.animator.play('death');
        else remote.sprite.animator.revive();
      }
    });
    for (const [id, remote] of remotes) {
      if (!seen.has(id)) {
        remote.sprite.dispose();
        remotes.delete(id);
      }
    }
    targetViews.sync(state.targets, performance.now());
    statusEl.textContent = t('connected', { count: state.players.size });
  });

  room.onLeave(() => {
    statusEl.textContent = t('disconnected');
  });

  if (import.meta.env.DEV) {
    // Read-only state probe for the browser e2e test; stripped from production builds.
    window.__aranyaDebug = () => {
      const targets: Record<string, number> = {};
      room.state.targets?.forEach((tg, id) => (targets[id] = tg.hp));
      return {
        sessionId: me,
        local: local ? { x: local.current.x, y: local.current.y, z: local.current.z } : null,
        remotes: Object.fromEntries([...remotes].map(([id, r]) => [id, r.buffer.sample(Number.POSITIVE_INFINITY)])),
        localAnim: localSprite ? { anim: localSprite.animator.current, facing: localSprite.animator.facing } : null,
        characters: layer.count,
        drawCalls: instrumentation.drawCallsCounter.current,
        frameTimeMs: instrumentation.frameTimeCounter.lastSecAverage,
        hp: mine?.hp ?? 0,
        resource: mine?.resource ?? 0,
        targets,
        numbersShown: numbers.spawned,
        telegraphs: telegraphs.count,
        locked: softLock.selected,
        projectiles: projectiles.count,
        acks: ackLog.slice(-10),
      };
    };
  }

  // Left mouse: a click locks the target under the cursor (SoftLock); holding it attacks
  // continuously. tryCast() refuses while a swing plays, so this just chains the combo.
  let mouseHeldSince: number | null = null;
  world.scene.onPointerObservable.add((info) => {
    if ((info.event as PointerEvent).button !== 0) return;
    if (info.type === PointerEventTypes.POINTERDOWN) mouseHeldSince = performance.now();
    else if (info.type === PointerEventTypes.POINTERUP) mouseHeldSince = null;
  });
  window.addEventListener('blur', () => (mouseHeldSince = null));

  // Fixed 20 Hz input/prediction loop driven by the render loop's accumulator.
  let accumulator = 0;
  let lastIntent = { mx: 0, mz: 0 };
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime();
    const now = performance.now();
    const player = local;

    if (player && !localDead) {
      if (keyboard.consume('Tab')) softLock.cycle(player.current);
      // Soft lock (GDD 4.3): aim at the locked target when it is in range, else where we face.
      const aim = softLock.aim(player.current) ?? { fx: player.current.fx, fz: player.current.fz };
      for (const skill of CAST_SKILLS) {
        if (keyboard.consume(HOTBAR_KEYS[skill].code)) {
          combat.tryCast(skill, aim, mine?.resource ?? 0, localSprite, now);
        }
      }
      if (mouseHeldSince !== null && now - mouseHeldSince >= HOLD_TO_ATTACK_MS) {
        combat.tryCast('attack', aim, mine?.resource ?? 0, localSprite, now);
      }
    }

    accumulator = Math.min(accumulator + dt, TICK_MS * MAX_TICKS_PER_FRAME);
    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      if (player) {
        const { mx, mz } = localDead ? { mx: 0 as const, mz: 0 as const } : keyboard.axes();
        let act: MotionAct = MotionAct.None;
        if (!localDead && keyboard.consume(DODGE_KEY)) act = MotionAct.Dodge;
        else if (!localDead && keyboard.consume(HOTBAR_KEYS.lunge.code)) act = MotionAct.Lunge;
        lastIntent = { mx, mz };
        room.send(Msg.Input, player.applyLocal(mx, mz, act));
      }
    }

    if (player && localSprite) {
      const pos = lerp(player.previous, player.current, accumulator / TICK_MS);
      localSprite.update(dt, pos, lastIntent);
      world.follow(pos);
      hud.update({
        hp: mine?.hp ?? 0,
        maxHp: mine?.maxHp ?? SWORDSMAN_STATS.maxHp,
        resource: mine?.resource ?? 0,
        resourceMax: SWORDSMAN_STATS.resourceMax,
        dead: localDead,
        cooldown: {
          stance: combat.cooldownFraction('stance', now),
          parry: combat.cooldownFraction('parry', now),
          ultimate: combat.cooldownFraction('ultimate', now),
          potion: combat.cooldownFraction('potion', now),
          manaPotion: combat.cooldownFraction('manaPotion', now),
          lunge: player.current.lungeCdTicks / LUNGE_CD_TICKS,
        },
      });
    }

    const renderTime = now - INTERPOLATION_DELAY_MS;
    for (const remote of remotes.values()) {
      const p = remote.buffer.sample(renderTime);
      if (p) remote.sprite.update(dt, p);
    }

    numbers.update(dt);
    telegraphs.update(dt);
    projectiles.update(dt);
    purify.update(dt);
    targetViews.update(dt, now);
    softLock.update();
    const locked = softLock.target();
    hud.updateTarget(locked ? { name: targetName(locked.kind, locked.species), hp: locked.hp, maxHp: locked.maxHp } : null);
    bots?.update(dt);
    world.scene.render();
  });
}

window.addEventListener('resize', () => {
  engine.resize();
  world.resize();
});

start().catch((err: unknown) => {
  console.error(err);
  statusEl.textContent = t('failed');
  engine.runRenderLoop(() => world.scene.render());
});
