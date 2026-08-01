import { expect } from "chai";
import { ethers } from "ethers";
import {
  V5_SWAP_PROTECTION_ENCODED_LENGTH,
  V5_SWAP_PROTECTION_VERSION,
  buildUnsignedV5ProtectedSwapPlan,
  decodeV5SwapProtectionV1,
  deriveMinimumNetOutput,
  encodeV5SwapProtectionV1,
  type V5ExactInputSingleRoute,
  type V5ProtectedSwapIntent,
  type V5QuoterExactInputNetQuote,
  type V5SwapProtectionBinding,
} from "../../scripts/v5/lib/v5ProtectedSwapPlan.js";

const address = (value: number) =>
  ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
const scheduleHash = (label: string) =>
  ethers.keccak256(ethers.toUtf8Bytes(label));

function route(exactAmount = 1_000_000n): V5ExactInputSingleRoute {
  return {
    poolKey: {
      currency0: address(1),
      currency1: address(2),
      fee: 3_000,
      tickSpacing: 60,
      hooks: address(3),
    },
    zeroForOne: true,
    exactAmount,
  };
}

function protection(): V5SwapProtectionBinding {
  return {
    minimumAcceptedPhase: 0,
    maximumPerLegFeeBps: 1_500,
    maximumNominalCombinedHookFeeBps: 2_775,
    deadline: 2_000n,
    expectedPhaseScheduleHash: scheduleHash("fixed-v5-phase-schedule"),
  };
}

function fixture(): {
  quote: V5QuoterExactInputNetQuote;
  intent: V5ProtectedSwapIntent;
} {
  return {
    quote: {
      route: route(),
      hookData: encodeV5SwapProtectionV1({
        version: V5_SWAP_PROTECTION_VERSION,
        ...protection(),
        minimumNetOutput: 0n,
      }),
      netOutput: 850_000n,
      quotedAtTimestamp: 1_000n,
    },
    intent: {
      route: route(),
      protection: protection(),
      selectedSlippageBps: 100,
      policyMaximumSlippageBps: 300,
      currentTimestamp: 1_100n,
    },
  };
}

describe("V5 protected exact-input swap plan", function () {
  it("ABI-encodes Hook SwapProtection V1 as the exact canonical 224-byte tuple", function () {
    const expected = {
      version: V5_SWAP_PROTECTION_VERSION,
      ...protection(),
      minimumNetOutput: 841_500n,
    };
    const hookData = encodeV5SwapProtectionV1(expected);
    expect(ethers.dataLength(hookData)).to.equal(
      V5_SWAP_PROTECTION_ENCODED_LENGTH
    );

    const directEncoding = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(uint8 version,uint8 minimumAcceptedPhase,uint16 maximumPerLegFeeBps,uint16 maximumNominalCombinedHookFeeBps,uint64 deadline,bytes32 expectedPhaseScheduleHash,uint256 minimumNetOutput)",
      ],
      [expected]
    );
    expect(hookData).to.equal(directEncoding);
    expect(decodeV5SwapProtectionV1(hookData)).to.deep.equal(expected);

    // Zero is ABI-valid for the struct and useful for an exploratory quote;
    // the unsigned execution-plan builder separately requires a positive min.
    const zeroMinimum = encodeV5SwapProtectionV1({
      ...expected,
      minimumNetOutput: 0n,
    });
    expect(decodeV5SwapProtectionV1(zeroMinimum).minimumNetOutput).to.equal(0n);
  });

  it("does not double-discount a V4Quoter output that already paid the 15% output fee", function () {
    // Illustrative pre-output-fee AMM output: 1,000,000. Hook V5 takes 15%, so
    // quoteExactInputSingle returns the post-Hook NET output of 850,000.
    const netV4QuoterOutput = 850_000n;
    const plan = buildUnsignedV5ProtectedSwapPlan(fixture());
    expect(plan.quoteOutputSemantics).to.equal("NET_AFTER_HOOK_OUTPUT_FEE");
    expect(plan.quotedNetOutput).to.equal(netV4QuoterOutput);
    expect(plan.protection.minimumNetOutput).to.equal(841_500n); // only 1% slippage

    const incorrectlyChargedAgain =
      (((netV4QuoterOutput * 8_500n) / 10_000n) * 9_900n) / 10_000n;
    expect(incorrectlyChargedAgain).to.equal(715_275n);
    expect(plan.protection.minimumNetOutput).not.to.equal(
      incorrectlyChargedAgain
    );
  });

  it("returns only a typed unsigned plan and binds the final protection into hookData", function () {
    const plan = buildUnsignedV5ProtectedSwapPlan(fixture());
    expect(plan.status).to.equal("UNSIGNED");
    expect(plan.quoterMethod).to.equal("quoteExactInputSingle");
    expect(plan.routeHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(plan.hookDataHash).to.equal(ethers.keccak256(plan.hookData));
    expect(plan.quotedHookDataHash).to.equal(
      ethers.keccak256(fixture().quote.hookData)
    );
    expect(plan.planHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(decodeV5SwapProtectionV1(plan.hookData)).to.deep.equal(
      plan.protection
    );
    expect(plan).not.to.have.property("to");
    expect(plan).not.to.have.property("calldata");
    expect(plan).not.to.have.property("signature");
  });

  it("fails closed when quote and execution route inputs differ", function () {
    const amountMismatch = fixture();
    amountMismatch.intent.route = route(1_000_001n);
    expect(() => buildUnsignedV5ProtectedSwapPlan(amountMismatch)).to.throw(
      "quote and execution route inputs differ"
    );

    const directionMismatch = fixture();
    directionMismatch.intent.route.zeroForOne = false;
    expect(() => buildUnsignedV5ProtectedSwapPlan(directionMismatch)).to.throw(
      "quote and execution route inputs differ"
    );

    const poolMismatch = fixture();
    poolMismatch.intent.route.poolKey.hooks = address(4);
    expect(() => buildUnsignedV5ProtectedSwapPlan(poolMismatch)).to.throw(
      "quote and execution route inputs differ"
    );
  });

  it("fails closed on schedule, phase-floor, fee-cap, or deadline mismatches", function () {
    const scheduleMismatch = fixture();
    scheduleMismatch.intent.protection.expectedPhaseScheduleHash =
      scheduleHash("other-schedule");
    expect(() => buildUnsignedV5ProtectedSwapPlan(scheduleMismatch)).to.throw(
      "expectedPhaseScheduleHash differ"
    );

    const phaseMismatch = fixture();
    phaseMismatch.intent.protection.minimumAcceptedPhase = 1;
    expect(() => buildUnsignedV5ProtectedSwapPlan(phaseMismatch)).to.throw(
      "minimumAcceptedPhase differ"
    );

    const feeMismatch = fixture();
    feeMismatch.intent.protection.maximumPerLegFeeBps = 1_499;
    expect(() => buildUnsignedV5ProtectedSwapPlan(feeMismatch)).to.throw(
      "maximumPerLegFeeBps rejects its minimum accepted phase"
    );

    const deadlineMismatch = fixture();
    deadlineMismatch.intent.protection.deadline += 1n;
    expect(() => buildUnsignedV5ProtectedSwapPlan(deadlineMismatch)).to.throw(
      "deadline differ"
    );
  });

  it("fails closed on expiry, future quote timestamps, and invalid net quotes", function () {
    const expired = fixture();
    expired.intent.currentTimestamp = expired.intent.protection.deadline;
    expect(() => buildUnsignedV5ProtectedSwapPlan(expired)).to.throw(
      "expired or has no executable time"
    );

    const future = fixture();
    future.quote.quotedAtTimestamp = future.intent.currentTimestamp + 1n;
    expect(() => buildUnsignedV5ProtectedSwapPlan(future)).to.throw(
      "cannot be in the future"
    );

    const zeroQuote = fixture();
    zeroQuote.quote.netOutput = 0n;
    expect(() => buildUnsignedV5ProtectedSwapPlan(zeroQuote)).to.throw(
      "quotedNetOutput must be positive"
    );

    const malformedHookData = fixture();
    malformedHookData.quote.hookData = "0x1234";
    expect(() => buildUnsignedV5ProtectedSwapPlan(malformedHookData)).to.throw(
      "224-byte"
    );
  });

  it("validates the selected slippage against a distinct policy maximum", function () {
    expect(
      deriveMinimumNetOutput({
        quotedNetOutput: 1_000_000n,
        selectedSlippageBps: 250,
        policyMaximumSlippageBps: 300,
      })
    ).to.equal(975_000n);

    expect(() =>
      deriveMinimumNetOutput({
        quotedNetOutput: 1_000_000n,
        selectedSlippageBps: 301,
        policyMaximumSlippageBps: 300,
      })
    ).to.throw("exceeds policyMaximumSlippageBps");
    expect(() =>
      deriveMinimumNetOutput({
        quotedNetOutput: 1_000_000n,
        selectedSlippageBps: 0,
        policyMaximumSlippageBps: 10_000,
      })
    ).to.throw("policyMaximumSlippageBps is out of bounds");
    expect(() =>
      deriveMinimumNetOutput({
        quotedNetOutput: 1n,
        selectedSlippageBps: 1,
        policyMaximumSlippageBps: 1,
      })
    ).to.throw("reduce minimumNetOutput to zero");
  });

  it("rejects malformed protection and non-canonical V5 pool routes", function () {
    const invalidSchedule = fixture();
    invalidSchedule.intent.protection.expectedPhaseScheduleHash =
      ethers.ZeroHash;
    expect(() => buildUnsignedV5ProtectedSwapPlan(invalidSchedule)).to.throw(
      "expectedPhaseScheduleHash cannot be zero"
    );

    const wrongPool = fixture();
    wrongPool.intent.route.poolKey.fee = 500;
    expect(() => buildUnsignedV5ProtectedSwapPlan(wrongPool)).to.throw(
      "canonical 3000 pips"
    );

    expect(() => decodeV5SwapProtectionV1("0x1234")).to.throw("224-byte");
  });
});
