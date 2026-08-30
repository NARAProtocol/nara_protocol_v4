import { expect } from "chai";
import { ethers } from "ethers";
import {
  buildV4ExactInputCall,
  cumulativeHookFee,
  exactLpFeeAmount,
  incrementalHookFees,
  parseV4SwapReceipt,
} from "../scripts/lib/v4TreasuryRangeSwap.js";
import type { FeeCurveState } from "../scripts/lib/v4TreasuryRangeState.js";

const CURVE: FeeCurveState = {
  mediumPressureBps: 1_000n,
  highPressureBps: 2_000n,
  extremePressureBps: 3_000n,
  baseFeeBps: 100n,
  mediumFeeBps: 200n,
  highFeeBps: 300n,
  extremeFeeBps: 400n,
  maxFeeBps: 500n,
};

describe("v4 treasury range real-route swap encoding", function () {
  it("matches cumulative same-block Hook fee accounting", function () {
    const fees = incrementalHookFees(CURVE, [100n, 100n, 100n, 100n], 1_000n);
    expect(fees.reduce((sum, fee) => sum + fee, 0n)).to.equal(cumulativeHookFee(CURVE, 400n, 1_000n));
    expect(cumulativeHookFee(CURVE, 0n, 1_000n)).to.equal(0n);
  });

  it("uses PoolManager complement-first LP-fee rounding at every boundary", function () {
    expect(exactLpFeeAmount(1n, 3_000n)).to.equal(1n);
    expect(1n * 3_000n / 1_000_000n).to.equal(0n);
    for (const fee of [0n, 1n, 3_000n, 999_999n]) {
      for (let input = 0n; input <= 100n; input += 1n) {
        const expected = input * fee % 1_000_000n === 0n
          ? input * fee / 1_000_000n
          : input * fee / 1_000_000n + 1n;
        expect(exactLpFeeAmount(input, fee)).to.equal(expected);
      }
    }
  });

  it("encodes atomic exact-input legs with one settle and one take", function () {
    const currency0 = "0x0000000000000000000000000000000000001000";
    const currency1 = "0x0000000000000000000000000000000000002000";
    const call = buildV4ExactInputCall({
      poolKey: { currency0, currency1, fee: 3_000, tickSpacing: 60, hook: "0x0000000000000000000000000000000000002088" },
      inputCurrency: currency0,
      legs: [{ amountIn: 10n, amountOutMinimum: 1n }, { amountIn: 20n, amountOutMinimum: 2n }],
      aggregateAmountOutMinimum: 3n,
      deadline: 1_000n,
    });
    expect(call.commands).to.equal("0x10");
    expect(call.totalAmountIn).to.equal(30n);
    expect(call.zeroForOne).to.equal(true);
    const [actions] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes", "bytes[]"], call.inputs[0]);
    expect(actions).to.equal("0x06060c0f");
  });

  it("parses actual PoolManager and Hook events by address and PoolId", function () {
    const events = new ethers.Interface([
      "event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)",
      "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
    ]);
    const poolId = `0x${"aa".repeat(32)}`;
    const sender = "0x0000000000000000000000000000000000001234";
    const currency = "0x0000000000000000000000000000000000005678";
    const swap = events.encodeEventLog(events.getEvent("Swap")!, [poolId, sender, 100n, -90n, 123n, 456n, 7n, 3_000n]);
    const hook = events.encodeEventLog(events.getEvent("PoolFeeTaken")!, [poolId, sender, currency, 110n, 10n, 909n, true]);
    const parsed = parseV4SwapReceipt([
      { address: "0x0000000000000000000000000000000000001111", ...swap },
      { address: "0x0000000000000000000000000000000000002222", ...hook },
    ] as unknown as ethers.Log[], {
      poolManager: "0x0000000000000000000000000000000000001111",
      hook: "0x0000000000000000000000000000000000002222",
    }, poolId);
    expect(parsed.swaps).to.have.length(1);
    expect(parsed.hookFees).to.have.length(1);
    expect(parsed.aggregateAmount0).to.equal(100n);
    expect(parsed.hookFeeByCurrency.get(ethers.getAddress(currency))).to.equal(10n);
  });
});
