import type { CastAck, FacingDir, PlayerAnim, Vec3 } from '@aranya/shared';

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
      /** Last cast acknowledgements from the server. */
      acks: (CastAck & { t: number })[];
    };
  }
}

export {};
