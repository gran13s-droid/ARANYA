import { MAX_INPUT_CREDITS, MAX_QUEUED_INPUTS, type InputMessage } from '@aranya/shared';

/**
 * Per-client input buffer with a token-bucket rate limit.
 * Each server tick grants one credit; each applied input spends one. A client
 * that sends inputs faster than the tick rate therefore cannot move faster,
 * while a short burst after network jitter is still caught up.
 */
export class InputQueue {
  private readonly queue: InputMessage[] = [];
  private credits = 0;
  private lastQueuedSeq = -1;

  /** Returns false when the input is stale, duplicated, or the queue is full. */
  push(input: InputMessage): boolean {
    if (input.seq <= this.lastQueuedSeq) return false;
    if (this.queue.length >= MAX_QUEUED_INPUTS) return false;
    this.queue.push(input);
    this.lastQueuedSeq = input.seq;
    return true;
  }

  /** Call exactly once per tick. Returns the inputs to simulate this tick, in order. */
  drain(): InputMessage[] {
    this.credits = Math.min(MAX_INPUT_CREDITS, this.credits + 1);
    const count = Math.min(this.credits, this.queue.length);
    this.credits -= count;
    return this.queue.splice(0, count);
  }

  get length(): number {
    return this.queue.length;
  }
}
