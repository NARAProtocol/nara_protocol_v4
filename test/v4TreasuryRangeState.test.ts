import { expect } from "chai";
import { ethers } from "ethers";
import {
  aggregateModifyLiquidityLogs,
  paginateManagerOrderIds,
  permanentTokenIds,
  positionId,
  reconcilePositions,
  type ReconciledPosition,
} from "../scripts/lib/v4TreasuryRangeState.js";

const EVENTS = new ethers.Interface([
  "event ModifyLiquidity(bytes32 indexed id,address indexed sender,int24 tickLower,int24 tickUpper,int256 liquidityDelta,bytes32 salt)",
]);

function modifyLog(blockNumber: number, delta: bigint): ethers.Log {
  const event = EVENTS.getEvent("ModifyLiquidity")!;
  const encoded = EVENTS.encodeEventLog(event, [
    `0x${"ab".repeat(32)}`,
    "0x0000000000000000000000000000000000001234",
    -120n,
    120n,
    delta,
    ethers.zeroPadValue("0x01", 32),
  ]);
  return { blockNumber, topics: encoded.topics, data: encoded.data } as unknown as ethers.Log;
}

describe("v4 treasury range state reconciliation", function () {
  it("aggregates repeated ModifyLiquidity events by exact core position key", function () {
    const candidates = aggregateModifyLiquidityLogs([modifyLog(10, 100n), modifyLog(12, -40n)]);
    expect(candidates).to.have.length(1);
    expect(candidates[0].observedLiquidityDelta).to.equal(60n);
    expect(candidates[0].firstObservedBlock).to.equal(10n);
    expect(candidates[0].lastObservedBlock).to.equal(12n);
    expect(positionId(candidates[0].owner, -120n, 120n, candidates[0].salt)).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("reconciles active liquidity and initialized tick gross/net exactly", function () {
    const candidate: ReconciledPosition = {
      owner: "0x0000000000000000000000000000000000001234",
      tickLower: -120n,
      tickUpper: 120n,
      salt: ethers.ZeroHash,
      firstObservedBlock: 1n,
      lastObservedBlock: 1n,
      observedLiquidityDelta: 50n,
      positionId: ethers.ZeroHash,
      liquidity: 50n,
      activeAtPinnedTick: true,
    };
    const exact = reconcilePositions({
      candidates: [candidate],
      pinnedTick: 0n,
      poolActiveLiquidity: 50n,
      actualTicks: new Map([
        [-120n, { liquidityGross: 50n, liquidityNet: 50n }],
        [120n, { liquidityGross: 50n, liquidityNet: -50n }],
      ]),
      scanFromBlock: 1n,
      scanToBlock: 2n,
    });
    expect(exact.exact).to.equal(true);
    const incomplete = reconcilePositions({
      ...{
        candidates: [candidate], pinnedTick: 0n, poolActiveLiquidity: 51n,
        actualTicks: new Map([[-120n, { liquidityGross: 50n, liquidityNet: 50n }]]),
        scanFromBlock: 1n, scanToBlock: 2n,
      },
    });
    expect(incomplete.exact).to.equal(false);
  });

  it("uses nextOffset pagination and refuses a non-advancing cursor", async function () {
    const pages = new Map<bigint, readonly [readonly bigint[], bigint]>([
      [0n, [[3n, 5n], 2n]],
      [2n, [[8n], 3n]],
      [3n, [[], 3n]],
    ]);
    expect(await paginateManagerOrderIds({
      pageSize: 2n,
      maximumOrders: 10n,
      fetchPage: async (offset) => pages.get(offset)!,
    })).to.deep.equal([3n, 5n, 8n]);
    let failure: Error | undefined;
    try {
      await paginateManagerOrderIds({
        pageSize: 2n,
        maximumOrders: 10n,
        fetchPage: async () => [[1n], 0n],
      });
    } catch (error) {
      failure = error as Error;
    }
    expect(failure?.message).to.contain("did not advance");
  });

  it("tracks both seed and compounder permanent positions and de-duplicates zero/same ids", function () {
    expect(permanentTokenIds(2_898_124n, 2_898_486n)).to.deep.equal([2_898_124n, 2_898_486n]);
    expect(permanentTokenIds(2_898_124n, 2_898_124n)).to.deep.equal([2_898_124n]);
    expect(permanentTokenIds(2_898_124n, 0n)).to.deep.equal([2_898_124n]);
  });
});
