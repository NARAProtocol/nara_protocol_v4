import { ethers } from "ethers";
import type { SettlerConfig } from "./config.js";
import { RANGE_MANAGER_ABI } from "./contracts.js";
import { safeErrorCode, structuredLog } from "./logging.js";
import {
  PENDING_SETTLEMENT_SCHEMA,
  RECONCILED_SETTLEMENT_SCHEMA,
  PendingSettlementStore,
  SettlementReconciliationStore,
  type PendingSettlement,
} from "./pending.js";
import type { Reconciler, TerminalOutcome } from "./reconciliation.js";
import { allSettledOrThrow, type RpcSource } from "./runtime.js";

export interface ExecutionResult {
  disposition: "submitted" | "pending" | "settled" | "race_lost" | "dropped" | "nonce_lineage_blocked" | "nothing_to_do";
  transactionHash?: string;
  orderIds: bigint[];
  terminalStatus?: Exclude<TerminalOutcome, "active">;
  pendingAgeMs?: number;
}

export type PendingAgeDisposition = "fresh" | "alert" | "drop_check";

export function classifyPendingAge(ageMs: number, alertAfterMs: number, dropAfterMs: number): PendingAgeDisposition {
  if (ageMs >= dropAfterMs) return "drop_check";
  if (ageMs >= alertAfterMs) return "alert";
  return "fresh";
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function raceResult(orderIds: bigint[], terminalStatus: Exclude<TerminalOutcome, "active">, transactionHash?: string): ExecutionResult {
  return { disposition: "race_lost", transactionHash, orderIds, terminalStatus };
}

export class SettlementExecutor {
  private readonly signer: ethers.Wallet;
  private readonly pendingStore: PendingSettlementStore;
  private readonly reconciliationStore: SettlementReconciliationStore;
  private execution: Promise<ExecutionResult> | undefined;

  constructor(
    private readonly config: SettlerConfig,
    private readonly reconciler: Reconciler,
    private readonly broadcastProvider: ethers.Provider,
    pendingStore = new PendingSettlementStore(config.pendingStatePath),
    reconciliationStore = new SettlementReconciliationStore(config.reconciliationDirectory),
  ) {
    this.signer = new ethers.Wallet(config.privateKey, broadcastProvider);
    this.pendingStore = pendingStore;
    this.reconciliationStore = reconciliationStore;
  }

  walletAddress(): Promise<string> {
    return this.signer.getAddress();
  }

  execute(orderIds: readonly bigint[]): Promise<ExecutionResult> {
    if (this.execution) return this.execution;
    this.execution = this.executeLocked(orderIds).finally(() => { this.execution = undefined; });
    return this.execution;
  }

  private async executeLocked(orderIds: readonly bigint[]): Promise<ExecutionResult> {
    this.reconciler.runtimeGate.assertHealthy();
    const pending = await this.reconcilePending();
    if (pending) return pending;
    const unique = [...new Set(orderIds.map(String))].map(BigInt).slice(0, this.config.maxSettlementBatch);
    if (unique.length === 0) return { disposition: "nothing_to_do", orderIds: [] };
    const point = await this.reconciler.commonConfirmedPoint(1);
    const confirmed = await this.reconciler.sweep(point);
    const eligible = unique.filter((id) => confirmed.settleableOrderIds.some((candidate) => candidate === id));
    if (eligible.length === 0) {
      const terminal = await this.reconciler.terminalOutcome(unique);
      return terminal === "active" ? { disposition: "nothing_to_do", orderIds: unique } : raceResult(unique, terminal);
    }
    const walletAddress = await this.signer.getAddress();
    const providerList: ReadonlyArray<readonly [RpcSource, ethers.Provider]> = [
      ["primary", this.reconciler.providers.primary],
      ["secondary", this.reconciler.providers.secondary],
      ["fallback", this.reconciler.providers.fallback],
    ];
    const balances = await allSettledOrThrow(providerList.map(([source, provider]) =>
      this.reconciler.rpc.one(source, "getBalance.settler", () => provider.getBalance(walletAddress, point.number))
    ));
    if (new Set(balances.map(String)).size !== 1) throw new Error("RPC_GAS_BALANCE_DISAGREEMENT");
    if (balances[0] < this.config.minGasBalanceWei) throw new Error("LOW_GAS_BALANCE");
    const readers = providerList.map(([, provider]) => new ethers.Contract(this.config.managerAddress, RANGE_MANAGER_ABI, provider));
    const previews = await allSettledOrThrow(readers.map((manager, index) =>
      this.reconciler.rpc.one(providerList[index][0], "call.settleMany.static", () =>
        manager.settleMany.staticCall(eligible, { from: walletAddress, blockTag: point.number })
      )
    ));
    if (new Set(previews.map(stable)).size !== 1) throw new Error("RPC_SETTLEMENT_SIMULATION_DISAGREEMENT");
    const fee = await this.reconciler.rpc.one("primary", "getFeeData", () => this.reconciler.providers.primary.getFeeData());
    if (fee.maxFeePerGas === null || fee.maxPriorityFeePerGas === null) throw new Error("EIP1559_FEE_DATA_UNAVAILABLE");
    if (fee.maxFeePerGas > this.config.maxFeePerGasWei || fee.maxPriorityFeePerGas > this.config.maxPriorityFeePerGasWei) {
      throw new Error("EIP1559_FEE_CAP_EXCEEDED");
    }
    const manager = new ethers.Contract(this.config.managerAddress, RANGE_MANAGER_ABI, this.signer);
    const estimate = await this.reconciler.rpc.one("primary", "estimateGas.settleMany", () =>
      manager.settleMany.estimateGas(eligible, {
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
      })
    );
    const gasLimit = (BigInt(estimate) * 120n + 99n) / 100n;
    if (gasLimit > this.config.maxGasLimit) throw new Error("SETTLEMENT_GAS_LIMIT_EXCEEDED");
    this.reconciler.runtimeGate.assertHealthy();
    const nonce = await this.reconciler.nextWriteNonce(walletAddress);
    this.reconciler.runtimeGate.assertHealthy();
    const rawTransaction = await this.signer.signTransaction({
      to: this.config.managerAddress,
      data: manager.interface.encodeFunctionData("settleMany", [eligible]),
      value: 0n,
      chainId: 8453n,
      type: 2,
      nonce,
      gasLimit,
      maxFeePerGas: fee.maxFeePerGas,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
    });
    const transactionHash = ethers.keccak256(rawTransaction).toLowerCase();
    const pendingState: PendingSettlement = {
      schemaVersion: PENDING_SETTLEMENT_SCHEMA,
      manager: this.config.managerAddress,
      wallet: walletAddress,
      transactionHash,
      rawTransaction,
      nonce,
      orderIds: eligible.map(String),
      preparedAtMs: Date.now(),
    };
    this.reconciler.runtimeGate.assertHealthy();
    try {
      this.pendingStore.save(pendingState);
    } catch {
      structuredLog("error", "pending_state_persist_failed", {
        transactionHash,
        nonce,
        orderIds: eligible.map(String),
      });
      throw new Error("PENDING_STATE_PERSIST_FAILED");
    }
    let response: ethers.TransactionResponse;
    try {
      this.reconciler.runtimeGate.assertHealthy();
      response = await this.reconciler.rpc.one("primary", "broadcastTransaction.initial", () =>
        this.broadcastProvider.broadcastTransaction(rawTransaction)
      );
    } catch (error) {
      structuredLog("warn", "settlement_broadcast_deferred", {
        transactionHash,
        nonce,
        orderIds: eligible.map(String),
        reasonCode: safeErrorCode(error),
      });
      throw error;
    }
    if (response.hash.toLowerCase() !== transactionHash) throw new Error("BROADCAST_TRANSACTION_HASH_MISMATCH");
    structuredLog("info", "settlement_submitted", {
      transactionHash,
      nonce,
      orderIds: eligible.map(String),
      wallet: walletAddress,
    });
    return { disposition: "submitted", transactionHash, orderIds: eligible };
  }

  private async reconcilePending(): Promise<ExecutionResult | undefined> {
    const pending = this.pendingStore.load();
    if (!pending) return undefined;
    const wallet = await this.signer.getAddress();
    if (pending.manager !== this.config.managerAddress || pending.wallet !== wallet) throw new Error("PENDING_STATE_BINDING_MISMATCH");
    const orderIds = pending.orderIds.map(BigInt);
    const age = Date.now() - pending.preparedAtMs;
    const ageDisposition = classifyPendingAge(age, this.config.pendingAlertAfterMs, this.config.pendingDropAfterMs);
    const consensus = await this.reconciler.receiptConsensus(pending.transactionHash);
    if (consensus.state === "agreed" && consensus.receipt) {
      if (!await this.reconciler.receiptConfirmed(consensus.receipt)) {
        return { disposition: "pending", transactionHash: pending.transactionHash, orderIds, pendingAgeMs: age };
      }
      await this.reconciler.assertSettlementTransaction(
        pending.transactionHash,
        pending.wallet,
        pending.nonce,
        orderIds,
      );
      if (consensus.receipt.status === 1) {
        const evidence = await this.reconciler.reconcileReceipt(consensus.receipt, orderIds);
        this.reconciliationStore.record({
          schemaVersion: RECONCILED_SETTLEMENT_SCHEMA,
          manager: pending.manager,
          wallet: pending.wallet,
          transactionHash: evidence.transactionHash,
          nonce: pending.nonce,
          orderIds: orderIds.map(String),
          receiptBlockNumber: evidence.receiptBlock.number,
          receiptBlockHash: evidence.receiptBlock.hash,
          naraOut: evidence.naraOut.toString(),
          usdcOut: evidence.usdcOut.toString(),
          recordedAtMs: evidence.receiptBlock.timestamp * 1_000,
        });
        this.pendingStore.clearAfterConfirmedReceipt(pending.transactionHash);
        structuredLog("info", "settlement_reconciled", {
          transactionHash: evidence.transactionHash,
          blockNumber: evidence.receiptBlock.number,
          blockHash: evidence.receiptBlock.hash,
          orderIds: orderIds.map(String),
        });
        return { disposition: "settled", transactionHash: evidence.transactionHash, orderIds, terminalStatus: "settled" };
      }
      const terminal = await this.reconciler.terminalOutcome(orderIds, consensus.receipt.blockNumber);
      this.pendingStore.clearAfterConfirmedReceipt(pending.transactionHash);
      if (terminal !== "active") return raceResult(orderIds, terminal, pending.transactionHash);
      throw new Error("SETTLEMENT_TRANSACTION_REVERTED");
    }
    if (consensus.state === "partial") {
      return { disposition: "pending", transactionHash: pending.transactionHash, orderIds, pendingAgeMs: age };
    }
    const terminal = await this.reconciler.terminalOutcome(orderIds);
    if (terminal !== "active") {
      structuredLog("warn", "settlement_nonce_lineage_retained", {
        transactionHash: pending.transactionHash,
        nonce: pending.nonce,
        pendingAgeMs: age,
        orderIds: orderIds.map(String),
        terminalStatus: terminal,
      });
      return {
        disposition: "nonce_lineage_blocked",
        transactionHash: pending.transactionHash,
        orderIds,
        terminalStatus: terminal,
        pendingAgeMs: age,
      };
    }
    const disposition = await this.reconciler.absentTransactionDisposition(
      pending.transactionHash,
      pending.wallet,
      pending.nonce,
    );
    if (disposition === "nonce_consumed") throw new Error("PENDING_NONCE_CONSUMED_UNKNOWN_TRANSACTION");
    if (disposition === "dropped" && ageDisposition !== "drop_check") {
      const point = await this.reconciler.commonConfirmedPoint(1);
      await this.reconciler.assertBindings(point);
      await this.reconciler.assertExactSettlementSimulation(pending.rawTransaction, point);
      this.reconciler.runtimeGate.assertHealthy();
      const response = await this.reconciler.rpc.one("primary", "broadcastTransaction.rebroadcast", () =>
        this.broadcastProvider.broadcastTransaction(pending.rawTransaction)
      );
      if (response.hash.toLowerCase() !== pending.transactionHash) throw new Error("BROADCAST_TRANSACTION_HASH_MISMATCH");
      structuredLog("info", "settlement_exact_rebroadcast", {
        transactionHash: pending.transactionHash,
        nonce: pending.nonce,
        orderIds: orderIds.map(String),
      });
      return { disposition: "pending", transactionHash: pending.transactionHash, orderIds, pendingAgeMs: age };
    }
    if (disposition === "dropped") {
      structuredLog("warn", "settlement_dropped_nonce_retained", {
        transactionHash: pending.transactionHash,
        nonce: pending.nonce,
        pendingAgeMs: age,
        orderIds: orderIds.map(String),
      });
      return { disposition: "dropped", transactionHash: pending.transactionHash, orderIds, pendingAgeMs: age };
    }
    return { disposition: "pending", transactionHash: pending.transactionHash, orderIds, pendingAgeMs: age };
  }
}
