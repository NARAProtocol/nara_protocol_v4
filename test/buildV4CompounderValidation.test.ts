import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compounderFreezeReady,
  validationMinLiquidity,
} from "../scripts/buildV4CompounderValidation.js";

describe("v4 compounder validation builder", function () {
  it("uses a 1% liquidity guard against the current simulation", function () {
    expect(validationMinLiquidity(1_000_000n)).to.equal(990_000n);
    expect(validationMinLiquidity(1n)).to.equal(1n);
    expect(() => validationMinLiquidity(0n)).to.throw("must be positive");
  });

  it("blocks the permanent freeze until every live position invariant holds", function () {
    const ready = {
      positionTokenId: 1n,
      totalLiquidityAdded: 100n,
      positionLiquidity: 100n,
      positionOwnerMatches: true,
      pendingRecoveryKind: 0n,
    };
    expect(compounderFreezeReady(ready)).to.equal(true);
    expect(compounderFreezeReady({ ...ready, positionTokenId: 0n })).to.equal(false);
    expect(compounderFreezeReady({ ...ready, positionOwnerMatches: false })).to.equal(false);
    expect(compounderFreezeReady({ ...ready, pendingRecoveryKind: 1n })).to.equal(false);
  });

  it("keeps full deployment wiring unfrozen until the separate live validation", function () {
    const deploymentSource = readFileSync(resolve("scripts/deployV4BaseUsdc.ts"), "utf8");
    expect(deploymentSource).to.contain('waitTx(journal, "vault.setCompounder"');
    expect(deploymentSource).not.to.contain('waitTx(journal, "vault.freezeCompounder"');
    expect(deploymentSource).to.contain("intentionally left unfrozen");
  });
});
