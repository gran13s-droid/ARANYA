import { schema, t } from '@colyseus/schema';

/**
 * Synced per-player state. Colyseus encodes changes as binary deltas at the
 * room's patch rate (20 Hz), so only fields that changed are sent.
 * The motion fields mirror shared `Motion` so the owner can reconcile its
 * prediction (dash and cooldown counters included).
 */
export const PlayerState = schema(
  {
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    fx: t.float32(),
    fz: t.float32(),
    dashKind: t.uint8(),
    dashTicks: t.uint8(),
    dodgeCdTicks: t.uint16(),
    lungeCdTicks: t.uint16(),
    speedMul: t.float32(),
    /** Last input sequence applied by the server; the owner reconciles against it. */
    lastSeq: t.uint32(),
    hp: t.uint16(),
    maxHp: t.uint16(),
    /** ปราณดาบ (GDD 5.1). */
    resource: t.uint8(),
    dead: t.boolean(),
  },
  'PlayerState',
);
export type PlayerState = InstanceType<typeof PlayerState>;

/** Training dummies (Step 1.2); monsters arrive in Step 1.3. */
export const TargetState = schema(
  {
    kind: t.string(),
    element: t.string(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    fx: t.float32(),
    fz: t.float32(),
    hp: t.uint16(),
    maxHp: t.uint16(),
    stunned: t.boolean(),
  },
  'TargetState',
);
export type TargetState = InstanceType<typeof TargetState>;

export const ZoneState = schema(
  {
    players: t.map(PlayerState),
    targets: t.map(TargetState),
  },
  'ZoneState',
);
export type ZoneState = InstanceType<typeof ZoneState>;
