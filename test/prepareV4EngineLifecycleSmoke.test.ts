import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLockTerms,
  computeWeight,
  parseLifecycleArgs,
  type WeightConfig,
} from "../scripts/prepareV4EngineLifecycleSmoke.js";

const WALLET = "0x0000000000000000000000000000000000001234";
const ONE = 10n ** 18n;

const CONFIG: WeightConfig = {
  durationLinearWad: 2n * ONE,
  durationQuadraticWad: ONE,
  activationDelayEpochs: 3n,
  maxLockEpochs: 100n,
};

describe("production v4 Engine lifecycle smoke preparer", function () {
  it("defaults to a bounded one-NARA smoke amount", function () {
    expect(parseLifecycleArgs(["--wallet", WALLET], {})).to.deep.equal({
      wallet: WALLET,
      amount: ONE,
      positionId: undefined,
      lockTxHash: undefined,
    });
  });

  it("accepts a smaller exact amount and one receipt locator", function () {
    const txHash = `0x${"12".repeat(32)}`;
    expect(parseLifecycleArgs([
      "--wallet", WALLET,
      "--amount", "0.25",
      "--lock-tx", txHash,
    ], {})).to.deep.equal({
      wallet: WALLET,
      amount: ONE / 4n,
      positionId: undefined,
      lockTxHash: txHash,
    });
  });

  it("rejects broadcasting flags, oversized value, and ambiguous position locators", function () {
    expect(() => parseLifecycleArgs(["--wallet", WALLET, "--execute"], {}))
      .to.throw("never signs or broadcasts");
    expect(() => parseLifecycleArgs(["--wallet", WALLET, "--amount", "1.000000000000000001"], {}))
      .to.throw("no more than 1 NARA");
    expect(() => parseLifecycleArgs([
      "--wallet", WALLET,
      "--position-id", "7",
      "--lock-tx", `0x${"34".repeat(32)}`,
    ], {})).to.throw("either --position-id or --lock-tx");
  });

  it("matches Solidity floor math for weight and chooses the shortest valid lifecycle", function () {
    const expectedRatio = 4n * ONE / 100n;
    const expectedRatioSquared = expectedRatio * expectedRatio / ONE;
    const expectedMultiplier = ONE
      + CONFIG.durationLinearWad * expectedRatio / ONE
      + CONFIG.durationQuadraticWad * expectedRatioSquared / ONE;
    expect(computeWeight(CONFIG, ONE, 4n)).to.equal(ONE * expectedMultiplier / ONE);

    const terms = buildLockTerms(CONFIG, ONE, 500n, 600n);
    expect(terms).to.deep.equal({
      grossAmount: ONE,
      tokenFee: 5n * 10n ** 16n,
      netAmount: 95n * 10n ** 16n,
      durationEpochs: 4n,
      minWeight: computeWeight(CONFIG, 95n * 10n ** 16n, 4n),
      createdEpoch: 600n,
      activationEpoch: 604n,
      unlockEpoch: 605n,
    });
  });

  it("contains no signing path or embedded production addresses", function () {
    const source = readFileSync(resolve("scripts/prepareV4EngineLifecycleSmoke.ts"), "utf8");
    expect(source).not.to.match(/new\s+ethers\.Wallet|PRIVATE_KEY|sendTransaction\s*\(|\.send\s*\(/);
    expect(source).not.to.include("0x98ab6406D6B548F37dEF7110961bb45A399e5aFC");
    expect(source).not.to.include("0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1");
    expect(source).to.include("assertProductionV4Runtime");
    expect(source).to.include("activeEngineRoles");
    expect(source).to.include('kind: "revoke"');
    expect(source).to.include("artifacts/contracts/v4/NARAEngine.sol/NARAEngine.json");
  });
});
