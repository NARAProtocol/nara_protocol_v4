import { expect } from "chai";
import { ethers } from "ethers";
import { requireExpectedPoolRegistrationState } from "../scripts/verifyV4Preflight.js";

describe("v4 preflight atomic launch state", function () {
  const poolId = `0x${"11".repeat(32)}`;

  it("requires an unregistered hook before the atomic launch batch", function () {
    expect(() => requireExpectedPoolRegistrationState(
      true,
      false,
      ethers.ZeroHash,
      poolId,
      0n,
    )).not.to.throw();
    expect(() => requireExpectedPoolRegistrationState(true, true, poolId, poolId, 1n))
      .to.throw("must remain unregistered");
  });

  it("requires the exact registered pool and bound price after launch", function () {
    expect(() => requireExpectedPoolRegistrationState(false, true, poolId, poolId, 123n))
      .not.to.throw();
    expect(() => requireExpectedPoolRegistrationState(false, false, ethers.ZeroHash, poolId, 0n))
      .to.throw("not registered");
    expect(() => requireExpectedPoolRegistrationState(
      false,
      true,
      `0x${"22".repeat(32)}`,
      poolId,
      123n,
    )).to.throw("poolId mismatch");
  });
});
