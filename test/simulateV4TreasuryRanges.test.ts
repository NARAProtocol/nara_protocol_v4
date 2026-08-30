import { expect } from "chai";
import { ethers } from "ethers";
import { hookConfigurationHash } from "../scripts/simulateV4TreasuryRanges.js";

describe("v4 treasury range simulator manifest hashing", function () {
  it("hashes exactly ten sorted label/expected pairs with canonical JSON and keccak256", function () {
    const checks = Array.from({ length: 10 }, (_unused, index) => ({
      label: String.fromCharCode(106 - index),
      target: "0x0000000000000000000000000000000000002088",
      method: "ignoredByFrozenHashSchema",
      args: [index.toString()],
      expected: (9 - index).toString(),
    }));
    const expectedPayload = Array.from({ length: 10 }, (_unused, index) => ({
      expected: index.toString(),
      label: String.fromCharCode(97 + index),
    }));
    const expectedCanonicalJson = JSON.stringify(expectedPayload);
    expect(hookConfigurationHash({ readChecks: checks }))
      .to.equal(ethers.keccak256(ethers.toUtf8Bytes(expectedCanonicalJson)).toLowerCase());
  });

  it("refuses incomplete Hook read-check configuration", function () {
    expect(() => hookConfigurationHash({ readChecks: [] }))
      .to.throw("exactly 10 readChecks");
  });
});
