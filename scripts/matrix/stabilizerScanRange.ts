export type StabilizerScanMode = "live" | "replay";

export interface StabilizerScanPlanInput {
  lastBlock: number;
  chainHead: number;
  replayFromBlock?: number;
  replayToBlock?: number;
  maxBlockRange?: number;
}

export interface StabilizerScanPlan {
  mode: StabilizerScanMode;
  baselineBlock?: number;
  fromBlock?: number;
  toBlock?: number;
  skippedFromBlock?: number;
  skippedToBlock?: number;
  complete: boolean;
  completeAfterRange: boolean;
}

export interface PumpHedgeAmountInput {
  whaleEquivalentNara: bigint;
  hedgeRatioBps: bigint;
  configuredCapNara: bigint;
  availableNara: bigint;
}

export function planPumpHedgeAmount({
  whaleEquivalentNara,
  hedgeRatioBps,
  configuredCapNara,
  availableNara,
}: PumpHedgeAmountInput): bigint {
  if (
    whaleEquivalentNara < 0n ||
    configuredCapNara < 0n ||
    availableNara < 0n
  ) {
    throw new Error("pump hedge amounts cannot be negative");
  }
  if (hedgeRatioBps < 1n || hedgeRatioBps > 10_000n) {
    throw new Error("hedgeRatioBps must be between 1 and 10000");
  }

  const ratioTarget = (whaleEquivalentNara * hedgeRatioBps) / 10_000n;
  const inventoryCap =
    availableNara < configuredCapNara ? availableNara : configuredCapNara;
  return ratioTarget < inventoryCap ? ratioTarget : inventoryCap;
}

function assertBlockNumber(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

/**
 * Plans one bounded stabilizer scan without touching a provider.
 *
 * Replay mode advances from replayFromBlock through replayToBlock in bounded
 * chunks. Live mode follows the current head and explicitly reports any range
 * skipped when the watcher fell more than maxBlockRange blocks behind.
 */
export function planStabilizerScan({
  lastBlock,
  chainHead,
  replayFromBlock = 0,
  replayToBlock = 0,
  maxBlockRange = 4_000,
}: StabilizerScanPlanInput): StabilizerScanPlan {
  assertBlockNumber("lastBlock", lastBlock);
  assertBlockNumber("chainHead", chainHead);
  assertBlockNumber("replayFromBlock", replayFromBlock);
  assertBlockNumber("replayToBlock", replayToBlock);
  if (!Number.isSafeInteger(maxBlockRange) || maxBlockRange < 1) {
    throw new Error("maxBlockRange must be a positive safe integer");
  }

  const replay = replayFromBlock > 0;
  if (!replay && replayToBlock > 0) {
    throw new Error("replayToBlock requires replayFromBlock");
  }
  if (replayToBlock > 0 && replayToBlock < replayFromBlock) {
    throw new Error(
      "replayToBlock must be greater than or equal to replayFromBlock"
    );
  }

  if (replay) {
    if (lastBlock === 0) {
      if (replayFromBlock > chainHead + 1) {
        throw new Error(
          "replayFromBlock cannot be more than one block ahead of the chain head"
        );
      }
      return {
        mode: "replay",
        baselineBlock: replayFromBlock - 1,
        complete: false,
        completeAfterRange: false,
      };
    }

    const availableEnd =
      replayToBlock > 0 ? Math.min(replayToBlock, chainHead) : chainHead;
    if (lastBlock >= availableEnd) {
      const complete = replayToBlock > 0 && lastBlock >= replayToBlock;
      return {
        mode: "replay",
        complete,
        completeAfterRange: false,
      };
    }

    const toBlock = Math.min(availableEnd, lastBlock + maxBlockRange);
    return {
      mode: "replay",
      fromBlock: lastBlock + 1,
      toBlock,
      complete: false,
      completeAfterRange: replayToBlock > 0 && toBlock >= replayToBlock,
    };
  }

  if (lastBlock === 0) {
    return {
      mode: "live",
      baselineBlock: chainHead,
      complete: false,
      completeAfterRange: false,
    };
  }
  if (lastBlock >= chainHead) {
    return {
      mode: "live",
      complete: false,
      completeAfterRange: false,
    };
  }

  const desiredFromBlock = lastBlock + 1;
  const boundedFromBlock = Math.max(
    desiredFromBlock,
    chainHead - maxBlockRange + 1
  );
  return {
    mode: "live",
    fromBlock: boundedFromBlock,
    toBlock: chainHead,
    skippedFromBlock:
      boundedFromBlock > desiredFromBlock ? desiredFromBlock : undefined,
    skippedToBlock:
      boundedFromBlock > desiredFromBlock ? boundedFromBlock - 1 : undefined,
    complete: false,
    completeAfterRange: false,
  };
}
