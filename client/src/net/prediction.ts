import { stepMotion, type InputMessage, type Level, type Motion, type MotionAct } from '@aranya/shared';

/**
 * Client-side prediction + server reconciliation for the local player.
 * Every tick the client applies its own input (walk, dodge, lunge) immediately
 * with the same shared stepMotion() the server uses, and remembers it until
 * the server acknowledges it. When an authoritative state arrives, the client
 * rewinds to it and replays the inputs the server has not processed yet.
 */
export class PredictedPlayer {
  private pending: InputMessage[] = [];
  private nextSeq = 1;
  /** Predicted state after the latest tick. */
  current: Motion;
  /** Predicted state one tick earlier, for render interpolation between ticks. */
  previous: Motion;

  constructor(
    private readonly level: Level,
    start: Motion,
  ) {
    this.current = start;
    this.previous = start;
  }

  /** Simulates one local tick and returns the input to send to the server. */
  applyLocal(mx: InputMessage['mx'], mz: InputMessage['mz'], act: MotionAct = 0): InputMessage {
    const input: InputMessage = act ? { seq: this.nextSeq++, mx, mz, act } : { seq: this.nextSeq++, mx, mz };
    this.pending.push(input);
    this.previous = this.current;
    this.current = stepMotion(this.level, this.current, input);
    return input;
  }

  /** Rewinds to the authoritative state and replays unacknowledged inputs. */
  reconcile(server: Motion, lastProcessedSeq: number): void {
    this.pending = this.pending.filter((i) => i.seq > lastProcessedSeq);
    let m: Motion = { ...server };
    for (const input of this.pending) m = stepMotion(this.level, m, input);
    this.current = m;
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
