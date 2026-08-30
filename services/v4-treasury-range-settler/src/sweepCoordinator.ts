import type { SweepReason } from "./watcher.js";
import { FatalRuntimeGate, withRuntimeDeadline } from "./runtime.js";

export class SweepCoordinator {
  private queuedReason: SweepReason | undefined;
  private running = false;

  constructor(
    private readonly gate: FatalRuntimeGate,
    private readonly timeoutMs: number,
    private readonly runPass: (reason: SweepReason) => Promise<void>,
  ) {}

  async trigger(reason: SweepReason): Promise<void> {
    this.gate.assertHealthy();
    this.queuedReason = reason;
    if (this.running) return;
    this.running = true;
    try {
      while (this.queuedReason) {
        this.gate.assertHealthy();
        const nextReason = this.queuedReason;
        this.queuedReason = undefined;
        await withRuntimeDeadline(this.gate, {
          code: "SWEEP_TIMEOUT",
          operation: nextReason,
          timeoutMs: this.timeoutMs,
        }, () => this.runPass(nextReason));
      }
    } finally {
      this.running = false;
    }
  }
}
