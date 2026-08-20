import { expect } from "chai";
import { ethers } from "ethers";
import {
  assertEngineFeeState,
  engineFeeCallPlan,
  TEST_ENGINE_FEES,
  ZERO_ENGINE_FEES,
} from "../scripts/buildV4EngineTestFees.js";

describe("v4 Engine test-fee Safe batch", function () {
  it("builds the four bounded fee calls in review order", function () {
    expect(engineFeeCallPlan(TEST_ENGINE_FEES)).to.deep.equal([
      { functionName: "setLockFee", args: [100n] },
      { functionName: "setClaimFee", args: [100n] },
      { functionName: "setLockEthFee", args: [1_000_000_000_000n] },
      { functionName: "setUnlockEthFee", args: [1_000_000_000_000n] },
    ]);
  });

  it("refuses to overwrite a changed live fee state", function () {
    expect(() => assertEngineFeeState({ ...ZERO_ENGINE_FEES, lockFeeBps: 1n }, ZERO_ENGINE_FEES))
      .to.throw("Engine lockFeeBps changed");
  });

  it("enforces the Engine percentage and flat-fee caps", function () {
    expect(() => engineFeeCallPlan({ ...TEST_ENGINE_FEES, lockFeeBps: 1_001n }))
      .to.throw("10% cap");
    expect(() => engineFeeCallPlan({ ...TEST_ENGINE_FEES, unlockFeeWei: ethers.parseEther("0.010000000000000001") }))
      .to.throw("0.01 ETH cap");
  });
});
