import { expect } from "chai";
import {
  modeledGasUsdc,
  STABILIZER_L1_DATA_BUFFER_USDC_ATOMIC,
} from "../scripts/matrix/stabilizerGasModel.js";

describe("v4 stabilizer conservative gas model", () => {
  it("applies both gas-unit and gas-price floors", () => {
    expect(modeledGasUsdc(100_000n, null)).to.equal(67_500n);
    expect(modeledGasUsdc(175_000n, 5_000_000n)).to.equal(67_500n);
  });

  it("uses twice the quoter estimate above the gas-unit floor", () => {
    expect(modeledGasUsdc(200_000n, null)).to.equal(70_000n);
  });

  it("uses twice the block base fee above the gas-price floor", () => {
    expect(modeledGasUsdc(100_000n, 6_000_000n)).to.equal(71_000n);
  });

  it("rounds fractional atomic USDC execution cost upward", () => {
    // 350,002 gas * 0.05 atomic USDC/gas = 17,500.1, rounded to 17,501.
    expect(modeledGasUsdc(175_001n, null)).to.equal(67_501n);
  });

  it("adds the fixed L1 data buffer after execution-cost conversion", () => {
    const total = modeledGasUsdc(100_000n, null);
    const executionOnly = 17_500n;

    expect(total - executionOnly).to.equal(
      STABILIZER_L1_DATA_BUFFER_USDC_ATOMIC
    );
    expect(STABILIZER_L1_DATA_BUFFER_USDC_ATOMIC).to.equal(50_000n);
  });

  it("rejects negative provider inputs", () => {
    expect(() => modeledGasUsdc(-1n, null)).to.throw(
      "quoteGasEstimate must be non-negative"
    );
    expect(() => modeledGasUsdc(1n, -1n)).to.throw(
      "baseFeePerGas must be non-negative or null"
    );
  });
});
