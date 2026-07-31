import { expect } from "chai";
import { ethers } from "ethers";
import {
  assertPoolOpeningIntegrity,
  requireExpectedPoolRegistrationState,
} from "../scripts/verifyV4Preflight.js";

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

describe("v4 preflight opening-price integrity", function () {
  const bound = 5602277097478613991873n;

  it("passes while the pool is still at its opening price", function () {
    expect(assertPoolOpeningIntegrity(true, bound, bound)).to.deep.equal({ drifted: false });
  });

  it("does not fail once the pool has traded away from the opening price", function () {
    // Regression: the old gate threw here, so every post-seed gate became
    // permanently unpassable the moment anyone swapped. The hook already
    // enforced the opening price on-chain via _beforeInitialize.
    expect(() => assertPoolOpeningIntegrity(true, bound, 8556925168162532601848n)).not.to.throw();
    expect(assertPoolOpeningIntegrity(true, bound, 8556925168162532601848n))
      .to.deep.equal({ drifted: true });
  });

  it("reports no drift for an uninitialized pool", function () {
    expect(assertPoolOpeningIntegrity(false, 0n, 0n)).to.deep.equal({ drifted: false });
  });

  it("fails when an initialized pool has no bound opening price", function () {
    expect(() => assertPoolOpeningIntegrity(true, 0n, bound))
      .to.throw("no bound opening price");
  });
});
