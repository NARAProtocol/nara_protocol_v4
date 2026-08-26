export type StabilizerAggregatedSide = "pump" | "floor";

export interface StabilizerTriggerAction {
  side: StabilizerAggregatedSide;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  amountIn: bigint;
  feeBps: number;
}

export interface StabilizerTransactionFlow {
  side: StabilizerAggregatedSide;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  terminalLogIndex: number;
  logIndices: number[];
  amountIn: bigint;
  feeBps: number;
  actionCount: number;
}

export interface StabilizerAggregatedTrigger {
  side: StabilizerAggregatedSide;
  blockNumber: number;
  blockHash: string;
  amountIn: bigint;
  feeBps: number;
  transactionHashes: string[];
  observationIds: string[];
  transactionCount: number;
  actionCount: number;
}

interface MutableTrigger extends StabilizerAggregatedTrigger {
  terminalLogIndex: number;
  transactionHashSet: Set<string>;
}

/** First stage: preserve transaction boundaries while summing atomic actions. */
export function aggregateStabilizerTransactionFlows(
  actions: readonly StabilizerTriggerAction[]
): StabilizerTransactionFlow[] {
  const grouped = new Map<string, StabilizerTransactionFlow>();
  for (const action of actions) {
    if (action.amountIn < 0n) throw new Error("amountIn must be non-negative");
    if (!Number.isSafeInteger(action.blockNumber) || action.blockNumber < 0) {
      throw new Error("blockNumber must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(action.logIndex) || action.logIndex < 0) {
      throw new Error("logIndex must be a non-negative safe integer");
    }
    const transactionHash = action.transactionHash.toLowerCase();
    const blockHash = action.blockHash.toLowerCase();
    const key = `${action.blockNumber}:${action.side}:${transactionHash}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        side: action.side,
        transactionHash,
        blockNumber: action.blockNumber,
        blockHash,
        terminalLogIndex: action.logIndex,
        logIndices: [action.logIndex],
        amountIn: action.amountIn,
        feeBps: action.feeBps,
        actionCount: 1,
      });
      continue;
    }
    existing.amountIn += action.amountIn;
    if (existing.blockHash !== blockHash) {
      throw new Error("transaction flow contains conflicting block hashes");
    }
    existing.actionCount += 1;
    existing.logIndices.push(action.logIndex);
    if (action.logIndex > existing.terminalLogIndex) {
      existing.terminalLogIndex = action.logIndex;
      existing.feeBps = action.feeBps;
    }
  }
  return [...grouped.values()];
}

/** Second stage: combine only already-qualified external transaction flows. */
export function aggregateStabilizerTriggers(
  qualifyingFlows: readonly StabilizerTransactionFlow[]
): StabilizerAggregatedTrigger[] {
  const grouped = new Map<string, MutableTrigger>();
  for (const flow of qualifyingFlows) {
    const key = `${flow.blockNumber}:${flow.side}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        side: flow.side,
        blockNumber: flow.blockNumber,
        blockHash: flow.blockHash,
        amountIn: flow.amountIn,
        feeBps: flow.feeBps,
        transactionHashes: [flow.transactionHash.toLowerCase()],
        observationIds: flow.logIndices.map(
          (logIndex) => `${flow.transactionHash.toLowerCase()}:${logIndex}`
        ),
        transactionCount: 1,
        actionCount: flow.actionCount,
        terminalLogIndex: flow.terminalLogIndex,
        transactionHashSet: new Set([flow.transactionHash.toLowerCase()]),
      });
      continue;
    }
    existing.amountIn += flow.amountIn;
    if (existing.blockHash !== flow.blockHash) {
      throw new Error("block-side trigger contains conflicting block hashes");
    }
    const transactionHash = flow.transactionHash.toLowerCase();
    if (!existing.transactionHashSet.has(transactionHash)) {
      existing.transactionHashSet.add(transactionHash);
      existing.transactionHashes.push(transactionHash);
      existing.transactionCount += 1;
    }
    existing.actionCount += flow.actionCount;
    existing.observationIds.push(
      ...flow.logIndices.map(
        (logIndex) => `${flow.transactionHash.toLowerCase()}:${logIndex}`
      )
    );
    if (flow.terminalLogIndex > existing.terminalLogIndex) {
      existing.terminalLogIndex = flow.terminalLogIndex;
      existing.feeBps = flow.feeBps;
    }
  }
  return [...grouped.values()].map(
    ({ terminalLogIndex: _, transactionHashSet: __, ...aggregate }) => aggregate
  );
}
