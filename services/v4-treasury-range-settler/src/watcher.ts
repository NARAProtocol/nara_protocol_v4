import { ethers } from "ethers";
import type { SettlerConfig } from "./config.js";
import { POOL_MANAGER_SWAP_ABI } from "./contracts.js";
import { safeErrorCode, structuredLog } from "./logging.js";
import { RpcDeadlineSet } from "./runtime.js";

export type SweepReason = "primary_swap" | "secondary_swap" | "poll" | "full_sweep" | "startup";

export class SwapWatcher {
  private readonly poolInterface = new ethers.Interface(POOL_MANAGER_SWAP_ABI);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly lastBlockAt = new Map<string, number>();
  private stopped = false;

  constructor(
    private readonly config: SettlerConfig,
    private readonly primary: ethers.WebSocketProvider,
    private readonly secondary: ethers.WebSocketProvider,
    private readonly fallback: ethers.JsonRpcProvider,
    private readonly rpc: RpcDeadlineSet,
    private readonly poolManager: string,
    private readonly poolId: string,
    private readonly onSweep: (reason: SweepReason) => Promise<void>,
    private readonly onAlert: (reasonCode: string, source: string) => Promise<void>,
  ) {}

  start(): void {
    const swap = this.poolInterface.getEvent("Swap");
    if (!swap) throw new Error("Swap event ABI is unavailable");
    const filter = { address: this.poolManager, topics: [swap.topicHash, this.poolId] };
    this.primary.on(filter, () => void this.trigger("primary_swap"));
    this.secondary.on(filter, () => void this.trigger("secondary_swap"));
    this.primary.on("block", () => this.lastBlockAt.set("primary", Date.now()));
    this.secondary.on("block", () => this.lastBlockAt.set("secondary", Date.now()));
    this.lastBlockAt.set("primary", Date.now());
    this.lastBlockAt.set("secondary", Date.now());
    this.timers.push(setInterval(() => void this.poll(), this.config.pollingIntervalMs));
    this.timers.push(setInterval(() => void this.trigger("full_sweep"), this.config.fullSweepIntervalMs));
    void this.trigger("startup");
  }

  private async trigger(reason: SweepReason): Promise<void> {
    if (this.stopped) return;
    try {
      await this.onSweep(reason);
    } catch (error) {
      structuredLog("error", "sweep_failed", { reasonCode: safeErrorCode(error), source: reason });
      await this.onAlert(safeErrorCode(error), reason).catch(() => undefined);
    }
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    const now = Date.now();
    for (const source of ["primary", "secondary"]) {
      if (now - (this.lastBlockAt.get(source) ?? 0) > this.config.rpcStaleMs) await this.onAlert("RPC_STALE", source);
    }
    try {
      await this.rpc.one("fallback", "watcher.getBlockNumber", () => this.fallback.getBlockNumber());
      await this.trigger("poll");
    } catch {
      await this.onAlert("FALLBACK_RPC_UNAVAILABLE", "fallback");
    }
  }

  async stop(): Promise<void> {
    this.stopNow();
    await Promise.allSettled([this.primary.removeAllListeners(), this.secondary.removeAllListeners()]);
  }

  stopNow(): void {
    this.stopped = true;
    for (const timer of this.timers) clearInterval(timer);
  }
}
