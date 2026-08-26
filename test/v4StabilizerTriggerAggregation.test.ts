import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  aggregateStabilizerTransactionFlows,
  aggregateStabilizerTriggers,
  type StabilizerTriggerAction,
} from "../scripts/matrix/v4StabilizerTriggerAggregation.js";

const PUMP_THRESHOLD = 100_000_000n;

function action(
  overrides: Partial<StabilizerTriggerAction> = {}
): StabilizerTriggerAction {
  return {
    side: "pump",
    transactionHash: "0xaaa",
    blockNumber: 100,
    blockHash: `0x${"11".repeat(32)}`,
    logIndex: 0,
    amountIn: 1n,
    feeBps: 100,
    ...overrides,
  };
}

function qualifyingPumpCandidates(actions: StabilizerTriggerAction[]) {
  const flows = aggregateStabilizerTransactionFlows(actions);
  return aggregateStabilizerTriggers(
    flows.filter((flow) => flow.amountIn >= PUMP_THRESHOLD)
  );
}

describe("v4 stabilizer two-stage trigger aggregation", () => {
  it("does not combine five unrelated 20-USDC transactions into a trigger", () => {
    const actions = Array.from({ length: 5 }, (_, index) =>
      action({
        transactionHash: `0x${index + 1}`,
        logIndex: index,
        amountIn: 20_000_000n,
      })
    );

    expect(qualifyingPumpCandidates(actions)).to.deep.equal([]);
  });

  it("qualifies one 20-action atomic 100-USDC transaction", () => {
    const actions = Array.from({ length: 20 }, (_, index) =>
      action({
        transactionHash: "0xABC",
        logIndex: index,
        amountIn: 5_000_000n,
        feeBps: 100 + index,
      })
    );

    expect(qualifyingPumpCandidates(actions)).to.deep.equal([
      {
        side: "pump",
        blockNumber: 100,
        blockHash: `0x${"11".repeat(32)}`,
        amountIn: PUMP_THRESHOLD,
        feeBps: 119,
        transactionHashes: ["0xabc"],
        observationIds: Array.from(
          { length: 20 },
          (_, index) => `0xabc:${index}`
        ),
        transactionCount: 1,
        actionCount: 20,
      },
    ]);
  });

  it("combines only independently qualifying transactions for one block quote", () => {
    const flows = aggregateStabilizerTransactionFlows([
      action({ transactionHash: "0xaaa", amountIn: 100_000_000n }),
      action({
        transactionHash: "0xbbb",
        logIndex: 1,
        amountIn: 120_000_000n,
        feeBps: 300,
      }),
    ]);

    expect(aggregateStabilizerTriggers(flows)).to.deep.equal([
      {
        side: "pump",
        blockNumber: 100,
        blockHash: `0x${"11".repeat(32)}`,
        amountIn: 220_000_000n,
        feeBps: 300,
        transactionHashes: ["0xaaa", "0xbbb"],
        observationIds: ["0xaaa:0", "0xbbb:1"],
        transactionCount: 2,
        actionCount: 2,
      },
    ]);
  });

  it("removes watched-wallet flows before block-side aggregation", () => {
    const external = aggregateStabilizerTransactionFlows([
      action({ transactionHash: "0xown", amountIn: 100_000_000n }),
      action({
        transactionHash: "0xexternal",
        logIndex: 1,
        amountIn: 100_000_000n,
      }),
    ]).filter((flow) => flow.transactionHash !== "0xown");

    expect(aggregateStabilizerTriggers(external)).to.deep.equal([
      {
        side: "pump",
        blockNumber: 100,
        blockHash: `0x${"11".repeat(32)}`,
        amountIn: 100_000_000n,
        feeBps: 100,
        transactionHashes: ["0xexternal"],
        observationIds: ["0xexternal:1"],
        transactionCount: 1,
        actionCount: 1,
      },
    ]);
  });

  it("produces no candidate when every transaction is watched-wallet flow", () => {
    const external = aggregateStabilizerTransactionFlows([
      action({ transactionHash: "0xown", amountIn: 100_000_000n }),
    ]).filter(() => false);
    expect(aggregateStabilizerTriggers(external)).to.deep.equal([]);
  });

  it("preserves sides and adjacent blocks as separate candidates", () => {
    const flows = aggregateStabilizerTransactionFlows([
      action({ side: "pump", amountIn: PUMP_THRESHOLD }),
      action({
        side: "floor",
        transactionHash: "0xbbb",
        logIndex: 1,
        amountIn: PUMP_THRESHOLD,
      }),
      action({
        side: "pump",
        transactionHash: "0xccc",
        blockNumber: 101,
        logIndex: 2,
        amountIn: PUMP_THRESHOLD,
      }),
    ]);
    expect(
      aggregateStabilizerTriggers(flows).map(({ blockNumber, side }) => ({
        blockNumber,
        side,
      }))
    ).to.deep.equal([
      { blockNumber: 100, side: "pump" },
      { blockNumber: 100, side: "floor" },
      { blockNumber: 101, side: "pump" },
    ]);
  });

  it("keeps pool filtering and transaction qualification ordered in runner", () => {
    const source = readFileSync(
      "scripts/matrix/runV4TwoSidedStabilizer.ts",
      "utf8"
    );
    const poolGuard = source.indexOf(
      "(ev.poolId as string).toLowerCase() !== config.poolId.toLowerCase()"
    );
    const transactionStage = source.indexOf(
      "aggregateStabilizerTransactionFlows(canonicalActions)"
    );
    const perTransactionThreshold = source.indexOf(
      "flow.amountIn >= PUMP_TRIGGER"
    );
    const blockStage = source.indexOf(
      "aggregateStabilizerTriggers(\n    qualifyingExternalFlows"
    );

    expect(transactionStage).to.be.greaterThan(poolGuard);
    expect(perTransactionThreshold).to.be.greaterThan(transactionStage);
    expect(blockStage).to.be.greaterThan(perTransactionThreshold);
  });

  it("fails closed on watched-wallet inventory and balance read errors", () => {
    const source = readFileSync(
      "scripts/matrix/runV4TwoSidedStabilizer.ts",
      "utf8"
    );
    expect(source).to.contain(
      'reason: "watched_wallet_inventory_unavailable_at_trigger_block"'
    );
    expect(source).to.contain(
      'reason: "watched_wallet_balance_unavailable_at_trigger_block"'
    );
    expect(source).not.to.contain("fall back to configured bucket");
    expect(source).not.to.contain("use the configured shadow cap");
  });
});
