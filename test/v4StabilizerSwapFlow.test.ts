import { expect } from "chai";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import {
  reconstructCanonicalSwapFlow,
  V4_POOL_MANAGER_SWAP_EVENT_ABI,
  V4_POOL_MANAGER_SWAP_EVENT_SIGNATURE,
  V4_POOL_MANAGER_SWAP_TOPIC,
  type CanonicalSwapLog,
  type StabilizerTriggerSide,
} from "../scripts/matrix/stabilizerSwapFlow.js";

const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const OTHER_ADDRESS = "0x1111111111111111111111111111111111111111";
const SENDER = "0x2222222222222222222222222222222222222222";
const TX_HASH = `0x${"ab".repeat(32)}`;
const OTHER_TX_HASH = `0x${"cd".repeat(32)}`;
const POOL_ID = `0x${"12".repeat(32)}`;
const OTHER_POOL_ID = `0x${"34".repeat(32)}`;
const swapInterface = new ethers.Interface([V4_POOL_MANAGER_SWAP_EVENT_ABI]);

function swapLog(
  amount0: bigint,
  amount1: bigint,
  overrides: Partial<CanonicalSwapLog> & { poolId?: string } = {}
): CanonicalSwapLog {
  const encoded = swapInterface.encodeEventLog(
    swapInterface.getEvent("Swap")!,
    [
      overrides.poolId ?? POOL_ID,
      SENDER,
      amount0,
      amount1,
      2n ** 96n,
      1_000_000n,
      0,
      3_000,
    ]
  );
  return {
    address: POOL_MANAGER,
    transactionHash: TX_HASH,
    logIndex: 7,
    topics: encoded.topics,
    data: encoded.data,
    ...overrides,
  };
}

function reconstruct(
  logs: readonly CanonicalSwapLog[],
  expectedSide: StabilizerTriggerSide,
  tokenIsCurrency0 = false
) {
  return reconstructCanonicalSwapFlow(logs, {
    poolManager: POOL_MANAGER,
    poolId: POOL_ID,
    tokenIsCurrency0,
    expectedSide,
    transactionHash: TX_HASH,
  });
}

describe("v4 canonical stabilizer swap flow", () => {
  it("matches the exact v4-core Swap signature and reconstructs an actual-order pump", () => {
    expect(V4_POOL_MANAGER_SWAP_EVENT_SIGNATURE).to.equal(
      "Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"
    );
    expect(V4_POOL_MANAGER_SWAP_TOPIC).to.equal(
      ethers.id(V4_POOL_MANAGER_SWAP_EVENT_SIGNATURE)
    );

    const flow = reconstruct(
      [swapLog(-123_456_789n, 2_500_000_000_000_000_001n)],
      "pump"
    );

    expect(flow).to.deep.equal({
      transactionHash: TX_HASH,
      poolId: POOL_ID,
      poolManager: POOL_MANAGER,
      side: "pump",
      tokenIsCurrency0: false,
      swapLogCount: 1,
      logIndices: [7],
      amount0CallerDelta: -123_456_789n,
      amount1CallerDelta: 2_500_000_000_000_000_001n,
      usdcIn: 123_456_789n,
      usdcOut: 0n,
      naraIn: 0n,
      naraOut: 2_500_000_000_000_000_001n,
    });
  });

  it("maps token-as-currency0 floor flow in exact bigint units", () => {
    const flow = reconstruct(
      [swapLog(-9_876_543_210_123_456_789n, 456_789_123n)],
      "floor",
      true
    );

    expect(flow.amount0CallerDelta).to.equal(-9_876_543_210_123_456_789n);
    expect(flow.amount1CallerDelta).to.equal(456_789_123n);
    expect(flow.usdcIn).to.equal(0n);
    expect(flow.usdcOut).to.equal(456_789_123n);
    expect(flow.naraIn).to.equal(9_876_543_210_123_456_789n);
    expect(flow.naraOut).to.equal(0n);
  });

  it("classifies the archived actual-order NARA sell as floor", () => {
    const flow = reconstruct(
      [swapLog(91_377_444n, -554_976_216_000_000_000_000n)],
      "floor",
      false
    );

    expect(flow.side).to.equal("floor");
    expect(flow.usdcIn).to.equal(0n);
    expect(flow.usdcOut).to.equal(91_377_444n);
    expect(flow.naraIn).to.equal(554_976_216_000_000_000_000n);
    expect(flow.naraOut).to.equal(0n);
  });

  it("aggregates multiple same-direction logs from the same transaction", () => {
    const flow = reconstruct(
      [
        swapLog(-40_000_001n, 800_000_000_000_000_001n, { logIndex: 12 }),
        swapLog(-59_999_999n, 1_199_999_999_999_999_999n, {
          logIndex: 9,
        }),
      ],
      "pump"
    );

    expect(flow.swapLogCount).to.equal(2);
    expect(flow.logIndices).to.deep.equal([9, 12]);
    expect(flow.amount0CallerDelta).to.equal(-100_000_000n);
    expect(flow.amount1CallerDelta).to.equal(2_000_000_000_000_000_000n);
    expect(flow.usdcIn).to.equal(100_000_000n);
    expect(flow.naraOut).to.equal(2_000_000_000_000_000_000n);
  });

  it("infers the exact transaction and side for ethers-v6 log indices", () => {
    const log = swapLog(-25_000_000n, 500_000_000_000_000_000n);
    const flow = reconstructCanonicalSwapFlow(
      [{ ...log, logIndex: undefined, index: 19 }],
      {
        poolManager: POOL_MANAGER,
        poolId: POOL_ID,
        tokenIsCurrency0: false,
      }
    );

    expect(flow.transactionHash).to.equal(TX_HASH);
    expect(flow.side).to.equal("pump");
    expect(flow.logIndices).to.deep.equal([19]);
    expect(flow.usdcIn).to.equal(25_000_000n);
    expect(flow.naraOut).to.equal(500_000_000_000_000_000n);
  });

  it("rejects logs from the wrong transaction, address, or pool", () => {
    expect(() =>
      reconstruct(
        [swapLog(-1n, 1n, { transactionHash: OTHER_TX_HASH })],
        "pump"
      )
    ).to.throw("canonical_swap_flow_rejected:wrong_transaction_hash");
    expect(() =>
      reconstruct([swapLog(-1n, 1n, { address: OTHER_ADDRESS })], "pump")
    ).to.throw("canonical_swap_flow_rejected:wrong_pool_manager");
    expect(() =>
      reconstruct([swapLog(-1n, 1n, { poolId: OTHER_POOL_ID })], "pump")
    ).to.throw("canonical_swap_flow_rejected:wrong_pool_id");
  });

  it("rejects malformed, zero, and same-sign flows", () => {
    const valid = swapLog(-1n, 1n);
    expect(() =>
      reconstruct([{ ...valid, topics: valid.topics.slice(0, 2) }], "pump")
    ).to.throw("canonical_swap_flow_rejected:malformed_topics");
    expect(() =>
      reconstruct([{ ...valid, data: `${valid.data}00` }], "pump")
    ).to.throw("canonical_swap_flow_rejected:malformed_data");
    expect(() =>
      reconstruct(
        [
          {
            ...valid,
            topics: [ethers.id("Other()"), ...valid.topics.slice(1)],
          },
        ],
        "pump"
      )
    ).to.throw("canonical_swap_flow_rejected:wrong_event_signature");
    expect(() => reconstruct([swapLog(0n, 1n)], "pump")).to.throw(
      "canonical_swap_flow_rejected:zero_flow"
    );
    expect(() => reconstruct([swapLog(1n, 1n)], "pump")).to.throw(
      "canonical_swap_flow_rejected:ambiguous_flow_signs"
    );
  });

  it("rejects mixed directions and a direction inconsistent with the trigger", () => {
    expect(() =>
      reconstruct(
        [
          swapLog(-10n, 20n, { logIndex: 1 }),
          swapLog(4n, -8n, { logIndex: 2 }),
        ],
        "pump"
      )
    ).to.throw("canonical_swap_flow_rejected:mixed_swap_directions");
    expect(() => reconstruct([swapLog(10n, -20n)], "pump")).to.throw(
      "canonical_swap_flow_rejected:unexpected_trigger_direction"
    );
  });

  it("rejects duplicate indices, removed logs, and empty evidence", () => {
    expect(() =>
      reconstruct(
        [swapLog(-1n, 2n, { logIndex: 4 }), swapLog(-3n, 4n, { logIndex: 4 })],
        "pump"
      )
    ).to.throw("canonical_swap_flow_rejected:duplicate_log_index");
    expect(() =>
      reconstruct([swapLog(-1n, 1n, { removed: true })], "pump")
    ).to.throw("canonical_swap_flow_rejected:removed_log");
    expect(() =>
      reconstruct([swapLog(-1n, 1n, { index: 8, logIndex: 9 })], "pump")
    ).to.throw("canonical_swap_flow_rejected:conflicting_log_index");
    expect(() => reconstruct([], "pump")).to.throw(
      "canonical_swap_flow_rejected:no_swap_logs"
    );
  });

  it("has no RPC, environment, signer, transaction, or write surface", () => {
    const source = readFileSync("scripts/matrix/stabilizerSwapFlow.ts", "utf8");

    expect(source).not.to.contain("process.env");
    expect(source).not.to.match(
      /JsonRpcProvider|Wallet|Signer|sendTransaction/
    );
    expect(source).not.to.match(/readFile|writeFile|appendFile|fetch\(/);
  });
});
