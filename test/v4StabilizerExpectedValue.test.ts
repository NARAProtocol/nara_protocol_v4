import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  calculateStabilizerExpectedValue,
  type StabilizerExpectedValueInput,
} from "../scripts/matrix/stabilizerExpectedValue.js";

const USDC = 10n ** 6n;

function completeInput(
  overrides: Partial<StabilizerExpectedValueInput> = {}
): StabilizerExpectedValueInput {
  return {
    scenarios: [
      {
        probabilityBps: 10_000n,
        exitProceedsUsdcAtomic: 102n * USDC,
        residualValueUsdcAtomic: 0n,
        evidenceComplete: true,
      },
    ],
    entryCostUsdcAtomic: 100n * USDC,
    entryGasUsdcAtomic: 0n,
    exitGasUsdcAtomic: 0n,
    otherCostsUsdcAtomic: 0n,
    evidenceComplete: true,
    minExpectedEdgeBps: 1n,
    minExpectedNetUsdcAtomic: 1n,
    ...overrides,
  };
}

describe("v4 stabilizer conservative expected value", () => {
  it("is negative for a losing executable round trip despite a favorable recovery mark", () => {
    const result = calculateStabilizerExpectedValue(
      completeInput({
        scenarios: [
          {
            probabilityBps: 10_000n,
            exitProceedsUsdcAtomic: 80n * USDC,
            residualValueUsdcAtomic: 10n * USDC,
            recoveryMarkUsdcAtomic: 140n * USDC,
            evidenceComplete: true,
          },
        ],
      })
    );

    expect(result.expectedGrossUsdcAtomic).to.equal(90n * USDC);
    expect(result.expectedNetUsdcAtomic).to.equal(-10n * USDC);
    expect(result.expectedEdgeBps).to.equal(-1_000n);
    expect(result.verdict).to.equal("NON_POSITIVE_EV");
  });

  it("lets explicit entry and exit gas flip a superficially positive trade negative", () => {
    const beforeGas = calculateStabilizerExpectedValue(completeInput());
    const afterGas = calculateStabilizerExpectedValue(
      completeInput({
        entryGasUsdcAtomic: 2n * USDC,
        exitGasUsdcAtomic: 1n * USDC,
      })
    );

    expect(beforeGas.expectedNetUsdcAtomic).to.equal(2n * USDC);
    expect(beforeGas.verdict).to.equal("POSITIVE_EV");
    expect(afterGas.totalCostsUsdcAtomic).to.equal(103n * USDC);
    expect(afterGas.expectedNetUsdcAtomic).to.equal(-1n * USDC);
    expect(afterGas.expectedEdgeBps).to.equal(-98n);
    expect(afterGas.verdict).to.equal("NON_POSITIVE_EV");
  });

  it("is negative when favorable recovery has too little probability weight", () => {
    const result = calculateStabilizerExpectedValue(
      completeInput({
        scenarios: [
          {
            probabilityBps: 9_000n,
            exitProceedsUsdcAtomic: 50n * USDC,
            residualValueUsdcAtomic: 0n,
            evidenceComplete: true,
          },
          {
            probabilityBps: 1_000n,
            exitProceedsUsdcAtomic: 150n * USDC,
            residualValueUsdcAtomic: 0n,
            evidenceComplete: true,
          },
        ],
      })
    );

    expect(result.expectedGrossUsdcAtomic).to.equal(60n * USDC);
    expect(result.expectedNetUsdcAtomic).to.equal(-40n * USDC);
    expect(result.expectedEdgeBps).to.equal(-4_000n);
    expect(result.verdict).to.equal("NON_POSITIVE_EV");
  });

  it("fails closed when a favorable mark is the only available exit evidence", () => {
    const result = calculateStabilizerExpectedValue(
      completeInput({
        scenarios: [
          {
            probabilityBps: 10_000n,
            exitProceedsUsdcAtomic: null,
            residualValueUsdcAtomic: null,
            recoveryMarkUsdcAtomic: 200n * USDC,
            evidenceComplete: false,
          },
        ],
        evidenceComplete: false,
      })
    );

    expect(result.expectedGrossUsdcAtomic).to.equal(null);
    expect(result.expectedNetUsdcAtomic).to.equal(null);
    expect(result.expectedEdgeBps).to.equal(null);
    expect(result.evidenceComplete).to.equal(false);
    expect(result.evidenceIssues).to.include.members([
      "evidence_set_incomplete",
      "scenario_0_evidence_incomplete",
      "scenario_0_missing_exit_proceeds",
      "scenario_0_missing_residual_value",
    ]);
    expect(result.verdict).to.equal("BLOCKED");
  });

  it("is positive EV exactly at both configured edge and net thresholds", () => {
    const result = calculateStabilizerExpectedValue(
      completeInput({
        minExpectedEdgeBps: 200n,
        minExpectedNetUsdcAtomic: 2n * USDC,
      })
    );

    expect(result.expectedNetUsdcAtomic).to.equal(2n * USDC);
    expect(result.expectedEdgeBps).to.equal(200n);
    expect(result.evidenceComplete).to.equal(true);
    expect(result.verdict).to.equal("POSITIVE_EV");
  });

  it("is non-positive EV when complete evidence misses either configured threshold", () => {
    const missesEdge = calculateStabilizerExpectedValue(
      completeInput({
        minExpectedEdgeBps: 201n,
        minExpectedNetUsdcAtomic: 2n * USDC,
      })
    );
    const missesNet = calculateStabilizerExpectedValue(
      completeInput({
        minExpectedEdgeBps: 200n,
        minExpectedNetUsdcAtomic: 2n * USDC + 1n,
      })
    );

    expect(missesEdge.evidenceComplete).to.equal(true);
    expect(missesEdge.verdict).to.equal("NON_POSITIVE_EV");
    expect(missesNet.evidenceComplete).to.equal(true);
    expect(missesNet.verdict).to.equal("NON_POSITIVE_EV");
  });

  it("blocks zero total committed cost even when every evidence flag is complete", () => {
    const result = calculateStabilizerExpectedValue(
      completeInput({
        scenarios: [
          {
            probabilityBps: 10_000n,
            exitProceedsUsdcAtomic: 1n,
            residualValueUsdcAtomic: 0n,
            evidenceComplete: true,
          },
        ],
        entryCostUsdcAtomic: 0n,
      })
    );

    expect(result.totalCostsUsdcAtomic).to.equal(0n);
    expect(result.expectedNetUsdcAtomic).to.equal(1n);
    expect(result.expectedEdgeBps).to.equal(null);
    expect(result.evidenceComplete).to.equal(false);
    expect(result.evidenceIssues).to.include("zero_total_cost");
    expect(result.verdict).to.equal("BLOCKED");
  });

  it("rounds weighted proceeds down and negative edge away from zero", () => {
    const weighted = calculateStabilizerExpectedValue(
      completeInput({
        scenarios: [
          {
            probabilityBps: 5_000n,
            exitProceedsUsdcAtomic: 1n,
            residualValueUsdcAtomic: 0n,
            evidenceComplete: true,
          },
          {
            probabilityBps: 5_000n,
            exitProceedsUsdcAtomic: 0n,
            residualValueUsdcAtomic: 0n,
            evidenceComplete: true,
          },
        ],
        entryCostUsdcAtomic: 3n,
      })
    );
    const signed = calculateStabilizerExpectedValue(
      completeInput({
        scenarios: [
          {
            probabilityBps: 10_000n,
            exitProceedsUsdcAtomic: 2n,
            residualValueUsdcAtomic: 0n,
            evidenceComplete: true,
          },
        ],
        entryCostUsdcAtomic: 3n,
      })
    );

    expect(weighted.expectedGrossUsdcAtomic).to.equal(0n);
    expect(weighted.expectedNetUsdcAtomic).to.equal(-3n);
    expect(signed.expectedNetUsdcAtomic).to.equal(-1n);
    expect(signed.expectedEdgeBps).to.equal(-3_334n);
  });

  it("rejects probability weights that do not sum exactly to 10,000 bps", () => {
    expect(() =>
      calculateStabilizerExpectedValue(
        completeInput({
          scenarios: [
            {
              probabilityBps: 9_999n,
              exitProceedsUsdcAtomic: 102n * USDC,
              residualValueUsdcAtomic: 0n,
              evidenceComplete: true,
            },
          ],
        })
      )
    ).to.throw("scenario probabilityBps must sum exactly to 10000; got 9999");
  });

  it("has no environment, RPC, signer, transaction, or floating-point surface", () => {
    const source = readFileSync(
      "scripts/matrix/stabilizerExpectedValue.ts",
      "utf8"
    );

    expect(source).not.to.contain("process.env");
    expect(source).not.to.contain("dotenv");
    expect(source).not.to.contain("ethers");
    expect(source).not.to.contain("Number(");
    expect(source).not.to.match(
      /Wallet|Signer|Provider|sendTransaction|fetch\(/
    );
  });
});
