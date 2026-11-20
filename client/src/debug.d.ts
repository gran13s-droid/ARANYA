import type { CastAck, FacingDir, PlayerAnim, Vec3 } from '@aranya/shared';
import type { MoveOrder } from './input/clickMove.ts';

declare global {
  interface Window {
    /** Dev-only probe used by the browser e2e tests. Undefined in production builds. */
    __aranyaDebug?: () => {
      sessionId: string;
      local: Vec3 | null;
      remotes: Record<string, Vec3 | null>;
      localAnim: { anim: PlayerAnim; facing: FacingDir } | null;
      characters: number;
      drawCalls: number;
      frameTimeMs: number;
      hp: number;
      resource: number;
      /** Training dummy HP by id. */
      targets: Record<string, number>;
      /** Damage/heal numbers shown so far. */
      numbersShown: number;
      /** Ground warnings currently visible. */
      telegraphs: number;
      /** Soft-locked target id. */
      locked: string | null;
      /** Rendered position of every living target. */
      targetPos: Record<string, Vec3>;
      /** Monsters drawn as pixel sprites, and each one's current animation. */
      monsterSprites: number;
      monsterAnims: Record<string, string>;
      /** Level id, current area, and streamed chunks / dynamic lights in use. */
      level: string;
      /** Level editor counts when opened with ?editor. */
      editor: { props: number; spawns: number; selected: string | null; dirty: boolean } | null;
      area: string | null;
      world: { chunks: number; lights: number; billboards: number };
      /** Current click-to-move order. */
      moveOrder: MoveOrder | null;
      /** Enemy projectiles in flight. */
      projectiles: number;
      /** Last cast acknowledgements from the server. */
      acks: (CastAck & { t: number })[];
    };
    /** Dev-only: world point to CSS pixel on the page (e2e clicks). */
    __aranyaProject?: (x: number, y: number, z: number) => { x: number; y: number };
  }
}

export {};
