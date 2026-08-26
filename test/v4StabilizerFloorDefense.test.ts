import { expect } from "chai";
import {
  calculateDumpUsdcValue,
  calculateFloorRecoveryEdge,
  classifyFloorDefenseVerdict,
  planFloorDefenseBudget,
} from "../scripts/matrix/stabilizerFloorDefense.js";

const USDC = 10n ** 6n;
const NARA = 10n ** 18n;
const PRICE = 10n ** 18n;

describe("v4 Phase 1 stabilizer floor defense", () => {
  describe("dump valuation", () => {
    it("values NARA sold in raw USDC units", () => {
      expect(calculateDumpUsdcValue(500n * NARA, PRICE / 5n)).to.equal(
        100n * USDC
      );
    });

    it("reaches the dump trigger at the exact threshold boundary", () => {
      const threshold = 100n * USDC;
      const value = calculateDumpUsdcValue(400n * NARA, PRICE / 4n);

      expect(value).to.equal(threshold);
      expect(value >= threshold).to.equal(true);
    });

    it("rounds sub-micro-USDC value down instead of crossing a trigger", () => {
      expect(calculateDumpUsdcValue(1n, PRICE)).to.equal(0n);
    });
  });

  describe("reserve floor and cap", () => {
    it("returns zero when the available balance equals the reserve floor", () => {
      expect(
        planFloorDefenseBudget({
          availableUsdc: 200n * USDC,
          reserveFloorUsdc: 200n * USDC,
          defenseCapUsdc: 150n * USDC,
        })
      ).to.deep.equal({ deployableUsdc: 0n, budgetUsdc: 0n });
    });

    it("returns zero when the reserve floor exceeds the available balance", () => {
      expect(
        planFloorDefenseBudget({
          availableUsdc: 199n * USDC,
          reserveFloorUsdc: 200n * USDC,
          defenseCapUsdc: 150n * USDC,
        })
      ).to.deep.equal({ deployableUsdc: 0n, budgetUsdc: 0n });
    });

    it("uses only balance above the reserve when it is below the cap", () => {
      expect(
        planFloorDefenseBudget({
          availableUsdc: 275n * USDC,
          reserveFloorUsdc: 200n * USDC,
          defenseCapUsdc: 150n * USDC,
        })
      ).to.deep.equal({
        deployableUsdc: 75n * USDC,
        budgetUsdc: 75n * USDC,
      });
    });

    it("caps the budget while reporting the full deployable balance", () => {
      expect(
        planFloorDefenseBudget({
          availableUsdc: 500n * USDC,
          reserveFloorUsdc: 200n * USDC,
          defenseCapUsdc: 150n * USDC,
        })
      ).to.deep.equal({
        deployableUsdc: 300n * USDC,
        budgetUsdc: 150n * USDC,
      });
    });

    it("uses only the configured cap without a watched-wallet balance", () => {
      expect(
        planFloorDefenseBudget({
          availableUsdc: null,
          reserveFloorUsdc: 200n * USDC,
          defenseCapUsdc: 150n * USDC,
        })
      ).to.deep.equal({
        deployableUsdc: 150n * USDC,
        budgetUsdc: 150n * USDC,
      });
    });
  });

  describe("entry, recovery edge, and verdict", () => {
    it("is NO_GO when a quote rounds to zero output", () => {
      expect(
        calculateFloorRecoveryEdge({
          budgetUsdc: 100n * USDC,
          quotedNaraOut: 0n,
          recoveryTargetUsdcPerNaraWad: PRICE / 10n,
          minEdgeBps: 100n,
        })
      ).to.deep.equal({
        entryNetUsdcPerNaraWad: null,
        recoveryValueUsdc: 0n,
        profitIfRecoveryUsdc: -100n * USDC,
        edgeBps: -10_000n,
        verdict: "NO_GO",
      });
    });

    it("rounds entry up and recovery value down conservatively", () => {
      const result = calculateFloorRecoveryEdge({
        budgetUsdc: 1n,
        quotedNaraOut: 3n * NARA,
        recoveryTargetUsdcPerNaraWad: 333_333_333_333n,
        minEdgeBps: 0n,
      });

      expect(result.entryNetUsdcPerNaraWad).to.equal(333_333_333_334n);
      expect(result.recoveryValueUsdc).to.equal(0n);
      expect(result.profitIfRecoveryUsdc).to.equal(-1n);
      expect(result.edgeBps).to.equal(-10_000n);
      expect(result.verdict).to.equal("NO_GO");
    });

    it("is NO_GO for negative recovery edge", () => {
      const result = calculateFloorRecoveryEdge({
        budgetUsdc: 100n * USDC,
        quotedNaraOut: 1_000n * NARA,
        recoveryTargetUsdcPerNaraWad: (PRICE * 99n) / 1_000n,
        minEdgeBps: 100n,
      });

      expect(result.profitIfRecoveryUsdc).to.equal(-1n * USDC);
      expect(result.edgeBps).to.equal(-100n);
      expect(result.verdict).to.equal("NO_GO");
    });

    it("is GO at the exact minimum edge boundary", () => {
      const result = calculateFloorRecoveryEdge({
        budgetUsdc: 100n * USDC,
        quotedNaraOut: 1_000n * NARA,
        recoveryTargetUsdcPerNaraWad: (PRICE * 101n) / 1_000n,
        minEdgeBps: 100n,
      });

      expect(result.entryNetUsdcPerNaraWad).to.equal(PRICE / 10n);
      expect(result.profitIfRecoveryUsdc).to.equal(1n * USDC);
      expect(result.edgeBps).to.equal(100n);
      expect(result.verdict).to.equal("GO");
    });

    it("is GO when positive edge exceeds the threshold", () => {
      const result = calculateFloorRecoveryEdge({
        budgetUsdc: 100n * USDC,
        quotedNaraOut: 1_000n * NARA,
        recoveryTargetUsdcPerNaraWad: (PRICE * 102n) / 1_000n,
        minEdgeBps: 100n,
      });

      expect(result.profitIfRecoveryUsdc).to.equal(2n * USDC);
      expect(result.edgeBps).to.equal(200n);
      expect(result.verdict).to.equal("GO");
    });

    it("keeps empty budgets NO_GO even at a zero edge threshold", () => {
      expect(classifyFloorDefenseVerdict(0n, NARA, 0n, 0n)).to.equal("NO_GO");
    });
  });
});
