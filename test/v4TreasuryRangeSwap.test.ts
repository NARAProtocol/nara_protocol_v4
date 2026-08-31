import { expect } from "chai";
import { ethers } from "ethers";
import {
  buildV4PostSwapSettleAllForkControlCall,
  buildV4ExactInputCall,
  cumulativeHookFee,
  decodeExactV4QuoterPoolManagerBalanceFailure,
  ERC20_TRANSFER_SELECTOR,
  exactLpFeeAmount,
  incrementalHookFees,
  parseV4SwapReceipt,
  V4_BEFORE_SWAP_SELECTOR,
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

const HOOK = "0x0000000000000000000000000000000000002088";
const NARA = "0x0000000000000000000000000000000000003000";
const POOL_MANAGER = "0x0000000000000000000000000000000000004000";
const TRANSIENT_ERROR_INTERFACE = new ethers.Interface([
  "error UnexpectedRevertBytes(bytes revertData)",
  "error WrappedError(address target,bytes4 selector,bytes reason,bytes details)",
  "error HookCallFailed()",
  "error ERC20TransferFailed()",
  "error ERC20InsufficientBalance(address sender,uint256 balance,uint256 needed)",
]);

function encodeTransientBalanceFailure(overrides: Readonly<{
  hook?: string;
  hookSelector?: string;
  hookDetails?: string;
  nara?: string;
  tokenSelector?: string;
  tokenDetails?: string;
  poolManager?: string;
  observedBalance?: bigint;
  needed?: bigint;
}> = {}): string {
  const insufficientBalance = TRANSIENT_ERROR_INTERFACE.encodeErrorResult(
    "ERC20InsufficientBalance",
    [
      overrides.poolManager ?? POOL_MANAGER,
      overrides.observedBalance ?? 6_312n,
      overrides.needed ?? 7_867n,
    ],
  );
  const tokenWrapper = TRANSIENT_ERROR_INTERFACE.encodeErrorResult("WrappedError", [
    overrides.nara ?? NARA,
    overrides.tokenSelector ?? ERC20_TRANSFER_SELECTOR,
    insufficientBalance,
    overrides.tokenDetails ?? TRANSIENT_ERROR_INTERFACE.encodeErrorResult("ERC20TransferFailed"),
  ]);
  const hookWrapper = TRANSIENT_ERROR_INTERFACE.encodeErrorResult("WrappedError", [
    overrides.hook ?? HOOK,
    overrides.hookSelector ?? V4_BEFORE_SWAP_SELECTOR,
    tokenWrapper,
    overrides.hookDetails ?? TRANSIENT_ERROR_INTERFACE.encodeErrorResult("HookCallFailed"),
  ]);
  return TRANSIENT_ERROR_INTERFACE.encodeErrorResult("UnexpectedRevertBytes", [hookWrapper]);
}

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

  it("pre-settles atomic exact-input legs before Hook fee collection", function () {
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
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const [actions, parameters] = abi.decode(["bytes", "bytes[]"], call.inputs[0]);
    expect(actions).to.equal("0x0b06060f");
    const [settleCurrency, settleAmount, payerIsUser] = abi.decode(
      ["address", "uint256", "bool"],
      parameters[0],
    );
    expect(settleCurrency).to.equal(ethers.getAddress(currency0));
    expect(settleAmount).to.equal(30n);
    expect(payerIsUser).to.equal(true);
  });

  it("retains the ordinary post-swap SETTLE_ALL route as a fork control", function () {
    const currency0 = "0x0000000000000000000000000000000000001000";
    const currency1 = "0x0000000000000000000000000000000000002000";
    const call = buildV4PostSwapSettleAllForkControlCall({
      poolKey: { currency0, currency1, fee: 3_000, tickSpacing: 60, hook: HOOK },
      inputCurrency: currency0,
      legs: [{ amountIn: 10n, amountOutMinimum: 1n }, { amountIn: 20n, amountOutMinimum: 2n }],
      aggregateAmountOutMinimum: 3n,
      deadline: 1_000n,
    });
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const [actions, parameters] = abi.decode(["bytes", "bytes[]"], call.inputs[0]);
    expect(actions).to.equal("0x06060c0f");
    const [settleCurrency, settleAmount] = abi.decode(["address", "uint256"], parameters[2]);
    expect(settleCurrency).to.equal(ethers.getAddress(currency0));
    expect(settleAmount).to.equal(30n);
  });

  it("decodes only the exact structured V4Quoter transient PoolManager balance failure", function () {
    const data = encodeTransientBalanceFailure();
    const decoded = decodeExactV4QuoterPoolManagerBalanceFailure({
      data: "0xdeadbeef",
      info: { error: { data } },
    }, { hook: HOOK, nara: NARA, poolManager: POOL_MANAGER });
    expect(decoded?.observedBalance).to.equal(6_312n);
    expect(decoded?.needed).to.equal(7_867n);
    expect(decoded?.errorFingerprint).to.equal(ethers.keccak256(data).toLowerCase());
  });

  it("does not parse revert hex from generic message text or raw strings", function () {
    const data = encodeTransientBalanceFailure();
    const config = { hook: HOOK, nara: NARA, poolManager: POOL_MANAGER };
    expect(decodeExactV4QuoterPoolManagerBalanceFailure({ message: `execution reverted ${data}` }, config))
      .to.equal(undefined);
    expect(decodeExactV4QuoterPoolManagerBalanceFailure(data, config)).to.equal(undefined);
  });

  it("rejects any mismatch in the exact wrapped-error identity chain", function () {
    const config = { hook: HOOK, nara: NARA, poolManager: POOL_MANAGER };
    const wrongAddress = "0x0000000000000000000000000000000000009999";
    const mismatches = [
      encodeTransientBalanceFailure({ hook: wrongAddress }),
      encodeTransientBalanceFailure({ hookSelector: "0x12345678" }),
      encodeTransientBalanceFailure({ hookDetails: "0x12345678" }),
      encodeTransientBalanceFailure({ nara: wrongAddress }),
      encodeTransientBalanceFailure({ tokenSelector: "0x12345678" }),
      encodeTransientBalanceFailure({ tokenDetails: "0x12345678" }),
      encodeTransientBalanceFailure({ poolManager: wrongAddress }),
      encodeTransientBalanceFailure({ observedBalance: 8_000n, needed: 7_867n }),
      `${encodeTransientBalanceFailure()}00`,
    ];
    for (const data of mismatches) {
      expect(decodeExactV4QuoterPoolManagerBalanceFailure({ data }, config)).to.equal(undefined);
    }
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
