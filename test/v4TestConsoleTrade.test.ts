import { expect } from "chai";
import { AbiCoder, hexlify } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEPLOYMENT } from "../tools/v4-test-console/src/generated/contracts.js";
import { tokenFeeBreakdown } from "../tools/v4-test-console/src/fees.js";
import {
  amountAfterNaraFee,
  buildTradeRouterCall,
  readTradeAllowances,
  reusableApprovalsReady,
  type TradeDirection,
} from "../tools/v4-test-console/src/trade.js";

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

function referenceCall(
  direction: TradeDirection,
  amountIn: bigint,
  amountOutMinimum: bigint,
  blockTimestamp: bigint,
) {
  const naraIsCurrency0 = BigInt(DEPLOYMENT.nara) < BigInt(DEPLOYMENT.usdc);
  const [currency0, currency1] = naraIsCurrency0
    ? [DEPLOYMENT.nara, DEPLOYMENT.usdc]
    : [DEPLOYMENT.usdc, DEPLOYMENT.nara];
  const input = direction === "buy" ? DEPLOYMENT.usdc : DEPLOYMENT.nara;
  const output = direction === "buy" ? DEPLOYMENT.nara : DEPLOYMENT.usdc;
  const zeroForOne = direction === "buy" ? !naraIsCurrency0 : naraIsCurrency0;
  const abi = AbiCoder.defaultAbiCoder();
  const swap = abi.encode(
    ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
    [[
      [currency0, currency1, DEPLOYMENT.poolFee, DEPLOYMENT.tickSpacing, DEPLOYMENT.hook],
      zeroForOne,
      amountIn,
      amountOutMinimum,
      "0x",
    ]],
  );
  const settle = abi.encode(["address", "uint256"], [input, amountIn]);
  const take = abi.encode(["address", "uint256"], [output, amountOutMinimum]);
  const actions = hexlify(new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]));
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swap, settle, take]]);
  return {
    commands: hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
    deadline: blockTimestamp + 600n,
  };
}

describe("v4 test console trade route", function () {
  it("matches the Engine's floor-rounded lock fee math", function () {
    expect(tokenFeeBreakdown(10n * 10n ** 18n, 0n)).to.deep.equal({
      grossAmount: 10n * 10n ** 18n,
      feeAmount: 0n,
      netAmount: 10n * 10n ** 18n,
      feeBps: 0n,
    });
    expect(tokenFeeBreakdown(101n, 100n)).to.deep.equal({
      grossAmount: 101n,
      feeAmount: 1n,
      netAmount: 100n,
      feeBps: 100n,
    });
  });

  it("subtracts the exact NARA fee from the input amount", function () {
    expect(amountAfterNaraFee(10_000_000n, 500_000n)).to.equal(9_500_000n);
    expect(amountAfterNaraFee(100n * 10n ** 18n, 5n * 10n ** 18n)).to.equal(95n * 10n ** 18n);
    expect(() => amountAfterNaraFee(1n, 2n)).to.throw("NARA fee cannot exceed the supplied amount");
  });

  for (const direction of ["buy", "sell"] as const) {
    it(`matches the production-tested ${direction} Universal Router encoding`, function () {
      const amountIn = direction === "buy" ? 1_000_000n : 100n * 10n ** 18n;
      const amountOutMinimum = direction === "buy" ? 80n * 10n ** 18n : 1_000_000n;
      const blockTimestamp = 1_787_000_000n;
      expect(buildTradeRouterCall(
        direction,
        amountIn,
        amountOutMinimum,
        blockTimestamp,
      )).to.deep.equal(referenceCall(
        direction,
        amountIn,
        amountOutMinimum,
        blockTimestamp,
      ));
    });
  }

  it("reuses sufficient active approvals without requiring an exact amount", function () {
    const amountIn = 1_000_000n;
    const base = {
      erc20: amountIn,
      permit2Amount: amountIn,
      permit2Expiration: 2_000n,
      permit2Nonce: 0n,
      blockTimestamp: 1_000n,
    };
    expect(reusableApprovalsReady(base, amountIn)).to.deep.equal({
      erc20: true,
      permit2: true,
    });
    expect(reusableApprovalsReady({ ...base, erc20: amountIn + 1n }, amountIn).erc20).to.equal(true);
    expect(reusableApprovalsReady({ ...base, permit2Amount: amountIn + 1n }, amountIn).permit2).to.equal(true);
    expect(reusableApprovalsReady({ ...base, erc20: amountIn - 1n }, amountIn).erc20).to.equal(false);
    expect(reusableApprovalsReady({ ...base, permit2Amount: amountIn - 1n }, amountIn).permit2).to.equal(false);
    expect(reusableApprovalsReady({ ...base, permit2Expiration: 1_600n }, amountIn).permit2).to.equal(false);
  });

  it("does not expose a repeat trade after the completed amount is cleared", function () {
    const reusable = {
      erc20: 1_000_000n,
      permit2Amount: 1_000_000n,
      permit2Expiration: 10_000n,
      permit2Nonce: 0n,
      blockTimestamp: 1_000n,
    };
    expect(reusableApprovalsReady(reusable, 0n)).to.deep.equal({ erc20: false, permit2: false });
  });

  it("preserves the ERC-20 scalar allowance while decoding Permit2's tuple", async function () {
    const amountIn = 10_000_000n;
    const client = {
      getBlockNumber: async () => 123n,
      readContract: async ({ address }: { address: string }) =>
        address.toLowerCase() === DEPLOYMENT.permit2.toLowerCase()
          ? [amountIn, 2_000n, 7n]
          : amountIn,
      getBlock: async () => ({ timestamp: 1_000n }),
    };
    expect(await readTradeAllowances(
      client as never,
      "0x0000000000000000000000000000000000001234",
      "buy",
    )).to.deep.equal({
      erc20: amountIn,
      permit2Amount: amountIn,
      permit2Expiration: 2_000n,
      permit2Nonce: 7n,
      blockTimestamp: 1_000n,
    });
  });

  it("uses exact atomic setup while disclosing existing approval layers and revocation", function () {
    const source = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    expect(source).to.include("args: [DEPLOYMENT.permit2, parsedTradeInput]");
    expect(source).to.include("The approvals are limited to this trade amount");
    expect(source).to.include("Exact approvals and the swap succeed together or all revert");
    expect(source).to.include("Token → Permit2");
    expect(source).to.include("Permit2 → Router");
    expect(source).to.include("Revoke Router access · first layer");
    expect(source).to.include("Revoke Permit2 ${tradeConfig.inputSymbol} access · final layer");
  });
});
