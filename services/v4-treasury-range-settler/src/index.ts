import { ethers } from "ethers";
import { canonicalProductionV4Deployment } from "../../../scripts/lib/v4LiveConfig.js";
import { publicSettlerConfig, readSettlerConfig } from "./config.js";
import { SettlementExecutor } from "./executor.js";
import { postStatus, safeErrorCode, sendTelegramNotification, structuredLog } from "./logging.js";
import { Reconciler } from "./reconciliation.js";
import { FatalRuntimeGate, RpcDeadlineSet, allSettledOrThrow, type RuntimeFault } from "./runtime.js";
import { SweepCoordinator } from "./sweepCoordinator.js";
import { SwapWatcher, type SweepReason } from "./watcher.js";

async function main(): Promise<void> {
  const config = readSettlerConfig();
  const production = canonicalProductionV4Deployment();
  const primary = new ethers.WebSocketProvider(config.primaryWsRpc, 8453, { staticNetwork: true });
  const secondary = new ethers.WebSocketProvider(config.secondaryWsRpc, 8453, { staticNetwork: true });
  const fallback = new ethers.JsonRpcProvider(config.fallbackHttpRpc, 8453, { staticNetwork: true, batchMaxCount: 6 });
  let watcher: SwapWatcher | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let fatalShutdownStarted = false;
  let lastSuccessAt = 0;
  const lastAlertAt = new Map<string, number>();

  const TRANSIENT_RPC_CODES = new Set([
    "SERVER_ERROR",
    "NETWORK_ERROR",
    "TIMEOUT",
    "UNKNOWN_ERROR",
    "ECONNRESET",
    "FETCH_ERROR",
  ]);

  const alert = async (reasonCode: string, source: string): Promise<void> => {
    const alertKey = `${reasonCode}:${source}`;
    const now = Date.now();
    if (now - (lastAlertAt.get(alertKey) ?? 0) < 300_000) return;
    lastAlertAt.set(alertKey, now);
    structuredLog("error", "settler_alert", { instanceId: config.instanceId, manager: config.managerAddress, reasonCode, source });
    if (!TRANSIENT_RPC_CODES.has(reasonCode)) {
      void sendTelegramNotification(
        config.telegramBotToken,
        config.telegramChatId,
        [
          `🟡 ⚠️ [SETTLER ALERT: ${reasonCode}]`,
          "━━━━━━━━━━━━━━━━━━━━",
          `📊 Reason: ${reasonCode}`,
          `🔍 Source: ${source}`,
          `🛡️ Manager: ${config.managerAddress}`,
          `⏱️ Time: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
        ].join("\n"),
      );
    }
    await postStatus(config.alertWebhookUrl, {
      service: "nara-v4-treasury-range-settler",
      instanceId: config.instanceId,
      manager: config.managerAddress,
      reasonCode,
      source,
      timestamp: new Date().toISOString(),
    }).catch((error) => structuredLog("warn", "alert_delivery_failed", { reasonCode: safeErrorCode(error), instanceId: config.instanceId }));
  };

  const fatalShutdown = (fault: RuntimeFault): void => {
    if (fatalShutdownStarted) return;
    fatalShutdownStarted = true;
    const source = fault.rpcSource ? `${fault.rpcSource}:${fault.operation}` : fault.operation;
    structuredLog("error", "settler_fatal_deadline", {
      instanceId: config.instanceId,
      manager: config.managerAddress,
      reasonCode: fault.code,
      source,
      rpcSource: fault.rpcSource,
      operation: fault.operation,
    });
    watcher?.stopNow();
    if (heartbeat) clearInterval(heartbeat);
    primary.destroy();
    secondary.destroy();
    fallback.destroy();
    process.exitCode = 1;
    void alert(fault.code, source).finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 1_000);
  };

  const runtimeGate = new FatalRuntimeGate(fatalShutdown);
  const rpc = new RpcDeadlineSet(runtimeGate, config.rpcRequestTimeoutMs);
  const reconciler = new Reconciler({ primary, secondary, fallback }, config, production, runtimeGate);
  const executor = new SettlementExecutor(config, reconciler, primary);
  const wallet = await executor.walletAddress();

  const runSweepPass = async (reason: SweepReason): Promise<void> => {
        const snapshot = await reconciler.sweep();
        if (snapshot.unknownPositionCount > 0n) {
          // Only the Safe can decide whether and how to quarantine an injected NFT.
          // Settlement of valid registered positions deliberately remains available.
          await alert("UNREGISTERED_POSITION_OWNERSHIP", reason);
        }
        if (snapshot.managerNaraBalance !== 0n || snapshot.managerUsdcBalance !== 0n) {
          // Anyone can donate pool tokens to the manager. This is actionable
          // telemetry, but it must never prevent a valid settlement attempt.
          await alert("MANAGER_POOL_TOKEN_DUST", reason);
        }
        const balance = await rpc.one("primary", "getBalance.telemetry", () => primary.getBalance(wallet, snapshot.point.number));
        if (balance < config.minGasBalanceWei) await alert("LOW_GAS_BALANCE", reason);
        const [walletNara, walletUsdc] = await allSettledOrThrow([
          rpc.one("primary", "call.nara.balanceOf.telemetry", () =>
            new ethers.Contract(production.token, ["function balanceOf(address) view returns(uint256)"], primary).balanceOf(wallet, { blockTag: snapshot.point.number }) as Promise<bigint>
          ),
          rpc.one("primary", "call.usdc.balanceOf.telemetry", () =>
            new ethers.Contract(production.base, ["function balanceOf(address) view returns(uint256)"], primary).balanceOf(wallet, { blockTag: snapshot.point.number }) as Promise<bigint>
          ),
        ]);
        if (BigInt(walletNara) !== 0n || BigInt(walletUsdc) !== 0n) await alert("SETTLER_TOKEN_BALANCE_NONZERO", reason);
        // Always reconcile a persisted pending transaction, even when the
        // current sweep has no newly settleable order. execute() never waits
        // for mining, so polling, full sweeps, heartbeats, and alerts stay live.
        const execution = await executor.execute(snapshot.settleableOrderIds);
        if (execution.disposition === "pending" &&
            (execution.pendingAgeMs ?? 0) >= config.pendingAlertAfterMs) {
          await alert("SETTLEMENT_TRANSACTION_PENDING", reason);
        } else if (execution.disposition === "dropped") {
          await alert("SETTLEMENT_TRANSACTION_DROPPED", reason);
        } else if (execution.disposition === "nonce_lineage_blocked") {
          await alert("SETTLEMENT_NONCE_LINEAGE_BLOCKED", reason);
        } else if (execution.disposition === "race_lost") {
          structuredLog("info", "settlement_terminal_race", {
            instanceId: config.instanceId,
            transactionHash: execution.transactionHash,
            orderIds: execution.orderIds.map(String),
            terminalStatus: execution.terminalStatus,
            source: reason,
          });
        }
        lastSuccessAt = Date.now();
        structuredLog("info", "sweep_complete", {
          instanceId: config.instanceId,
          manager: config.managerAddress,
          blockNumber: snapshot.point.number,
          blockHash: snapshot.point.hash,
          count: snapshot.activeOrders.length,
          source: reason,
        });
  };

  const coordinator = new SweepCoordinator(runtimeGate, config.sweepTimeoutMs, runSweepPass);
  const sweep = (reason: SweepReason): Promise<void> => coordinator.trigger(reason);
  watcher = new SwapWatcher(config, primary, secondary, fallback, rpc, production.poolManager, production.poolId, sweep, alert);
  heartbeat = setInterval(() => {
    void postStatus(config.heartbeatUrl, {
      service: "nara-v4-treasury-range-settler",
      status: Date.now() - lastSuccessAt <= config.rpcStaleMs * 2 ? "healthy" : "degraded",
      instanceId: config.instanceId,
      manager: config.managerAddress,
      wallet,
      lastSuccessAt,
      timestamp: new Date().toISOString(),
    }).catch((error) => structuredLog("warn", "heartbeat_failed", { reasonCode: safeErrorCode(error), instanceId: config.instanceId }));
  }, config.heartbeatIntervalMs);

  const shutdown = async (signal: string): Promise<void> => {
    structuredLog("info", "shutdown", { reasonCode: signal, instanceId: config.instanceId });
    clearInterval(heartbeat);
    await watcher?.stop();
    primary.destroy();
    secondary.destroy();
    fallback.destroy();
    process.exitCode = 0;
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  structuredLog("info", "settler_starting", { ...publicSettlerConfig(config), wallet });
  watcher.start();
}

main().catch((error) => {
  structuredLog("error", "settler_fatal", { reasonCode: safeErrorCode(error), message: (error as Error)?.message });
  process.exitCode = 1;
});
