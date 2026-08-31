import { expect } from "chai";
import { ethers } from "ethers";
import {
  TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV,
  assertTreasuryRangeSingleSignerRiskAccepted,
  canonicalTreasuryRangeAuthorities,
} from "../scripts/lib/v4TreasuryRangeConfig.js";
import {
  BASE_SAFE_141_SINGLETON,
  BASE_SAFE_141_SINGLETON_CODEHASH,
  NARA_SAFE_FALLBACK_HANDLER,
  NARA_SAFE_FALLBACK_HANDLER_CODEHASH,
  SAFE_MODULE_SENTINEL,
  assertTreasuryRangeSafeSnapshot,
  safeOwnerSetHash,
  type TreasuryRangeSafePolicy,
  type TreasuryRangeSafeSnapshot,
} from "../scripts/lib/v4SafeEvidence.js";

const SAFE = "0x1000000000000000000000000000000000000001";
const OWNER_A = "0x2000000000000000000000000000000000000002";
const OWNER_B = "0x3000000000000000000000000000000000000003";
const SAFE_RUNTIME_HASH = `0x${"11".repeat(32)}`;
const BLOCK_HASH = `0x${"22".repeat(32)}`;

function fixture(): { policy: TreasuryRangeSafePolicy; snapshot: TreasuryRangeSafeSnapshot } {
  const owners = [OWNER_A];
  return {
    policy: {
      address: SAFE,
      safeRuntimeCodeHash: SAFE_RUNTIME_HASH,
      version: "1.4.1",
      threshold: 1n,
      ownerCount: 1,
      ownerSetHash: safeOwnerSetHash(owners),
    },
    snapshot: {
      address: SAFE,
      version: "1.4.1",
      threshold: 1n,
      owners,
      nonce: 4n,
      modules: [],
      nextModule: SAFE_MODULE_SENTINEL,
      guard: ethers.ZeroAddress,
      fallbackHandler: NARA_SAFE_FALLBACK_HANDLER,
      singleton: BASE_SAFE_141_SINGLETON,
      safeRuntimeCodeHash: SAFE_RUNTIME_HASH,
      singletonRuntimeCodeHash: BASE_SAFE_141_SINGLETON_CODEHASH,
      fallbackHandlerRuntimeCodeHash: NARA_SAFE_FALLBACK_HANDLER_CODEHASH,
      verifiedAtBlock: 123,
      verifiedAtBlockHash: BLOCK_HASH,
    },
  };
}

describe("Treasury Range dedicated Safe policy", function () {
  it("hashes owner sets deterministically and without order dependence", function () {
    expect(safeOwnerSetHash([OWNER_A, OWNER_B])).to.equal(safeOwnerSetHash([OWNER_B, OWNER_A]));
    expect(safeOwnerSetHash([OWNER_A])).not.to.equal(safeOwnerSetHash([OWNER_B]));
  });

  it("returns sanitized exact evidence without raw owner addresses", function () {
    const { policy, snapshot } = fixture();
    const evidence = assertTreasuryRangeSafeSnapshot(policy, snapshot);
    expect(evidence.ownerCount).to.equal(1);
    expect(evidence.ownerSetHash).to.equal(policy.ownerSetHash);
    expect(evidence.threshold).to.equal("1");
    expect(evidence).not.to.have.property("owners");
    const serialized = JSON.stringify(evidence).toLowerCase();
    expect(serialized).not.to.contain(OWNER_A.toLowerCase());
  });

  it("fails closed on every pinned topology boundary", function () {
    const { policy, snapshot } = fixture();
    const cases: Array<[string, TreasuryRangeSafePolicy, TreasuryRangeSafeSnapshot]> = [
      ["address", policy, { ...snapshot, address: OWNER_B }],
      ["runtime", policy, { ...snapshot, safeRuntimeCodeHash: `0x${"33".repeat(32)}` }],
      ["singleton", policy, { ...snapshot, singleton: OWNER_B }],
      ["singleton hash", policy, { ...snapshot, singletonRuntimeCodeHash: `0x${"33".repeat(32)}` }],
      ["version", policy, { ...snapshot, version: "1.3.0" }],
      ["threshold", policy, { ...snapshot, threshold: 2n }],
      ["owner count", policy, { ...snapshot, owners: [OWNER_A, OWNER_B] }],
      ["owner hash", { ...policy, ownerSetHash: safeOwnerSetHash([OWNER_B]) }, snapshot],
      ["guard", policy, { ...snapshot, guard: OWNER_B }],
      ["fallback", policy, { ...snapshot, fallbackHandler: OWNER_B }],
      ["fallback hash", policy, { ...snapshot, fallbackHandlerRuntimeCodeHash: `0x${"33".repeat(32)}` }],
      ["module", policy, { ...snapshot, modules: [OWNER_B] }],
      ["module pagination", policy, { ...snapshot, nextModule: OWNER_B }],
      ["block hash", policy, { ...snapshot, verifiedAtBlockHash: ethers.ZeroHash }],
    ];
    for (const [label, changedPolicy, changedSnapshot] of cases) {
      expect(
        () => assertTreasuryRangeSafeSnapshot(changedPolicy, changedSnapshot),
        label,
      ).to.throw();
    }
  });

  it("pins different deployment and custody Safes and requires explicit 1-of-1 acceptance", function () {
    const authorities = canonicalTreasuryRangeAuthorities();
    expect(authorities.deploymentExecutorSafe).not.to.equal(authorities.treasuryRangeSafe);
    expect(authorities.treasuryRangeSafeThreshold).to.equal(1n);
    expect(authorities.treasuryRangeSafeOwnerCount).to.equal(1);
    expect(() => assertTreasuryRangeSingleSignerRiskAccepted({}, authorities)).to.throw(
      new RegExp(TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV),
    );
    expect(() => assertTreasuryRangeSingleSignerRiskAccepted({
      [TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV]: authorities.deploymentExecutorSafe,
    }, authorities)).to.throw();
    expect(() => assertTreasuryRangeSingleSignerRiskAccepted({
      [TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV]: authorities.treasuryRangeSafe,
    }, authorities)).not.to.throw();
  });
});
