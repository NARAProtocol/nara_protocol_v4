import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildSwapExecutionPlan } from "../tools/v4-test-console/src/swap-flow.js";
import { isAtomicSimulationGasValidationError } from "../tools/v4-test-console/src/sponsorship.js";
import { formatTimestampSeconds } from "../tools/v4-test-console/src/time.js";

const amountIn = 1_000_000n;
const activeAllowances = {
  erc20: amountIn,
  permit2Amount: amountIn,
  permit2Expiration: 10_000n,
  permit2Nonce: 0n,
  blockTimestamp: 1_000n,
};

describe("NARA Swap mobile execution policy", function () {
  it("exposes NARAswap as a separate section on the live console page", function () {
    const source = readFileSync(
      resolve("tools/v4-test-console/src/app.tsx"),
      "utf8",
    );
    expect(source).to.include('? "NARAswap"');
    expect(source).to.include("<h1>NARAswap</h1>");
    expect(source).to.include("Direct v4 swap · exact input");
    expect(source).to.include('const naraSwapWalletBlocked = tab === "trade" && connectedWithBaseAccount');
    expect(source).to.include("Hosted Base Account is disabled for NARAswap");
    expect(source).to.include("Choose another wallet to use NARAswap");
  });

  it("uses one atomic wallet confirmation when setup is missing and supported", function () {
    expect(buildSwapExecutionPlan({
      amountIn,
      allowances: null,
      atomicSupported: true,
    })).to.deep.equal({
      mode: "atomic",
      steps: ["token-approval", "router-approval", "swap"],
      walletConfirmations: 1,
    });
  });

  it("retries only the known Base RPC atomic validation gas-cap error", function () {
    expect(isAtomicSimulationGasValidationError(
      "The amount of gas provided for the transaction exceeds the limit allowed for the block. (code -32000 · intrinsic gas too high)",
    )).to.equal(true);
    expect(isAtomicSimulationGasValidationError("execution reverted: minimum output"))
      .to.equal(false);
    expect(isAtomicSimulationGasValidationError("user rejected the request"))
      .to.equal(false);
  });

  it("never crashes on malformed or out-of-range provider timestamps", function () {
    expect(formatTimestampSeconds(0n)).to.equal("—");
    expect(formatTimestampSeconds(1_786_947_451n)).to.not.equal("Unavailable");
    expect(formatTimestampSeconds((1n << 48n) - 1n)).to.equal("Unavailable");
    expect(formatTimestampSeconds(10n ** 100n)).to.equal("Unavailable");
  });

  it("makes every non-atomic setup action explicit", function () {
    expect(buildSwapExecutionPlan({
      amountIn,
      allowances: null,
      atomicSupported: false,
    })).to.deep.equal({
      mode: "sequential",
      steps: ["token-approval", "router-approval", "swap"],
      walletConfirmations: 3,
    });
  });

  it("submits only a swap when both access layers are active", function () {
    expect(buildSwapExecutionPlan({
      amountIn,
      allowances: activeAllowances,
      atomicSupported: false,
    })).to.deep.equal({
      mode: "sequential",
      steps: ["swap"],
      walletConfirmations: 1,
    });
  });

  it("does not expose the failing hosted Base Account connector", function () {
    const source = readFileSync(
      resolve("tools/v4-test-console/swap-site/src/main.tsx"),
      "utf8",
    );
    expect(source).to.include('coinbaseWallet.preference = "eoaOnly"');
    expect(source).to.not.match(/base\s+as\s+baseWallet/);
    expect(source).to.not.include("wallets: [baseWallet]");
    expect(source).to.not.include("Base Account (passkey)");
    expect(source).to.include('key: "nara-swap-preview"');
  });

  it("keeps review and wallet submission as separate user actions", function () {
    const source = readFileSync(
      resolve("tools/v4-test-console/swap-site/src/swap-app.tsx"),
      "utf8",
    );
    expect(source).to.include("Review swap");
    expect(source).to.include("Confirm in wallet");
    expect(source).to.not.include("Unlimited approval");
  });

  it("keeps submitted actions locked when receipt polling pauses", function () {
    const source = readFileSync(
      resolve("tools/v4-test-console/swap-site/src/swap-app.tsx"),
      "utf8",
    );
    expect(source).to.include("This transaction may still be pending; do not submit it again.");
    expect(source).to.include("keepPending: true");
    expect(source).to.include("Consume it before any");
    expect(source).to.include("The swap is confirmed, but the received amount could not be displayed.");
  });
});
