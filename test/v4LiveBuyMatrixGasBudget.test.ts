import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  calculateLiveBuyMatrixGasBudget,
  LIVE_BUY_GAS_ASSUMPTIONS,
} from "../scripts/matrix/liveBuyMatrixGasBudget.js";

describe("v4 live buy Matrix gas budget", () => {
  it("covers approvals, every configured trade, cleanup, and L1 buffers", () => {
    const budget = calculateLiveBuyMatrixGasBudget(1n, 100);
    expect(budget.approvalTransactionCount).to.equal(2);
    expect(budget.tradeTransactionCount).to.equal(100);
    expect(budget.cleanupTransactionCount).to.equal(2);
    expect(budget.totalTransactionCount).to.equal(104);
    expect(budget.unbufferedGasUnits).to.equal(60_480_000n);
    expect(budget.bufferedGasUnits).to.equal(90_720_000n);
    expect(budget.totalL1EthBufferWei).to.equal(
      104n * LIVE_BUY_GAS_ASSUMPTIONS.l1EthBufferPerTransactionWei
    );
    expect(budget.requiredEthWei).to.equal(
      budget.executionGasWei + budget.totalL1EthBufferWei
    );
  });

  it("uses the base-fee floor and configured gas-price multiplier", () => {
    const budget = calculateLiveBuyMatrixGasBudget(null, 1);
    expect(budget.observedBaseFeePerGasWei).to.equal(0n);
    expect(budget.modeledGasPriceWei).to.equal(
      LIVE_BUY_GAS_ASSUMPTIONS.baseFeeFloorWei * 2n
    );
  });

  it("uses a higher observed base fee conservatively", () => {
    const budget = calculateLiveBuyMatrixGasBudget(30_000_000n, 1);
    expect(budget.modeledGasPriceWei).to.equal(60_000_000n);
  });

  it("rejects invalid base fees and trade counts", () => {
    expect(() => calculateLiveBuyMatrixGasBudget(-1n, 1)).to.throw(
      "baseFeePerGasWei must be non-negative"
    );
    expect(() => calculateLiveBuyMatrixGasBudget(1n, 0)).to.throw(
      "tradeTransactionCount must be a positive safe integer"
    );
  });

  it("keeps read-only mode free of private-key loading and signer construction", () => {
    const source = readFileSync(
      "scripts/matrix/runV4LiveTenMinBuyMatrix.ts",
      "utf8"
    );
    expect(source).to.contain(
      'const wallet = execute\n    ? new ethers.Wallet(requiredEnv("PRIVATE_KEY"), provider)\n    : null;'
    );
    expect(source).to.contain("const contractRunner = wallet ?? provider;");
    expect(source).to.contain(
      'if (!wallet) throw new Error("Execute mode signer was not initialized")'
    );
    expect(source.indexOf('requiredEnv("PRIVATE_KEY")')).to.be.greaterThan(
      source.indexOf("const execute = process.argv.includes")
    );
  });
});
