import { expect } from "chai";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PRODUCTION_V4_MANIFEST_PATH,
  canonicalProductionV4Deployment,
} from "../scripts/lib/v4LiveConfig.js";

const repoRoot = resolve(import.meta.dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("v4 production runtime guard enforcement", () => {
  it("rejects any modification to the pinned production manifest", () => {
    const directory = mkdtempSync(join(tmpdir(), "nara-production-manifest-"));
    try {
      const manifest = readFileSync(PRODUCTION_V4_MANIFEST_PATH, "utf8");
      const changedPath = join(directory, "changed.json");
      writeFileSync(changedPath, manifest.replace("\"poolFee\": 3000", "\"poolFee\": 500"));

      expect(() => canonicalProductionV4Deployment(changedPath)).to.throw(
        "Production v4 manifest hash mismatch",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("runs bytecode verification in every high-risk Base operational entry point", () => {
    const guardedScripts = [
      "scripts/maintainV4Epochs.ts",
      "scripts/buildV4EpochRecoveryBatch.ts",
      "scripts/verifyV4LaunchGates.ts",
      "scripts/deployV4Allocations.ts",
      "scripts/deployPositionNFTStack.ts",
      "scripts/verifyPositionNFTPhase2.ts",
      "scripts/verifyPositionNFTPhase2Sources.ts",
      "scripts/buildPositionNFTPhase2Finalization.ts",
      "scripts/finalizePositionNFTPhase2Evidence.ts",
      "scripts/deployRouterLens.ts",
      "scripts/fundEmissionReserveV4.ts",
      "scripts/verifyV4AllocationsLive.ts",
      "scripts/deployComposabilityV4.ts",
    ];

    for (const script of guardedScripts) {
      expect(source(script), script).to.contain("assertProductionV4Runtime");
    }
  });

  it("keeps the construction-only production bypass out of operational scripts", () => {
    const operationalScripts = [
      "scripts/buildAtomicV4PoolLaunch.ts",
      "scripts/buildV4CompoundKeeperAuthorization.ts",
      "scripts/buildV4CompounderValidation.ts",
      "scripts/buildV4FeeCurveUpdate.ts",
      "scripts/executeV4NaraDepth.ts",
      "scripts/maintainV4Liquidity.ts",
      "scripts/removeV4Liquidity.ts",
      "scripts/runV4LiveSameBlockBuyTaxMatrix.ts",
      "scripts/runV4LiveSameBlockSellReversal.ts",
      "scripts/seedV4Liquidity.ts",
      "scripts/smokeTestV4Deployment.ts",
      "scripts/swapNaraForUsdc.ts",
      "scripts/swapUsdcForNara.ts",
      "scripts/verifyV4Preflight.ts",
    ];

    for (const script of operationalScripts) {
      const contents = source(script);
      expect(contents, script).to.contain("currentV4Config()");
      expect(contents, script).not.to.contain("requireProduction: false");
    }
  });

  it("keeps scheduled epoch execution pinned, isolated, and bounded", () => {
    const workflow = source(".github/workflows/v4-epoch-maintainer.yml");
    const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    const hydrateIndex = workflow.indexOf("npm run v4:env:production:write");
    const runtimeIndex = workflow.indexOf("npm run verify:v4:runtime-config");
    const checkIndex = workflow.indexOf("npm run maintain:v4:epochs:routine:check");
    const executeIndex = workflow.indexOf("run: npm run maintain:v4:epochs:routine", checkIndex + 1);

    expect(hydrateIndex).to.be.greaterThan(-1);
    expect(runtimeIndex).to.be.greaterThan(hydrateIndex);
    expect(checkIndex).to.be.greaterThan(runtimeIndex);
    expect(executeIndex).to.be.greaterThan(checkIndex);
    expect(workflow).to.contain("vars.V4_EPOCH_MAINTAINER_ENABLED == 'true'");
    expect(workflow).to.contain("secrets.V4_EPOCH_KEEPER_PRIVATE_KEY");
    expect(workflow).to.contain("vars.V4_EPOCH_KEEPER_ADDRESS");
    expect(workflow).to.contain('V4_EPOCH_REQUIRE_HEARTBEAT: "true"');
    expect(workflow).to.contain('cron: "3,18,33,48 * * * *"');
    expect(packageJson.scripts["maintain:v4:epochs:routine:check"])
      .to.equal("tsx scripts/maintainV4Epochs.ts --batch-size 100 --max-batches 2 --max-backlog 150");
    expect(packageJson.scripts["maintain:v4:epochs:routine"])
      .to.equal("tsx scripts/maintainV4Epochs.ts --execute --batch-size 100 --max-batches 2 --max-backlog 150");
    expect(workflow).not.to.contain("vars.V4_ENGINE");
    expect(workflow).not.to.contain("V4_OPERATIONS_KEEPER_PRIVATE_KEY");
    expect(workflow).not.to.contain("V4_OPERATIONS_KEEPER_ENABLED");
    expect(workflow).not.to.contain("maintain:v4:liquidity");
    expect(workflow).not.to.contain("npm run maintain:v4:epochs -- --");
  });

  it("keeps scheduled liquidity execution manifest-pinned, explicitly enabled, and policy-bounded", () => {
    const workflow = source(".github/workflows/v4-liquidity-maintainer.yml");
    const hydrateIndex = workflow.indexOf("npm run v4:env:production:write");
    const runtimeIndex = workflow.indexOf("npm run verify:v4:runtime-config");
    const executeIndex = workflow.indexOf("npm run maintain:v4:liquidity -- --execute");

    expect(hydrateIndex).to.be.greaterThan(-1);
    expect(runtimeIndex).to.be.greaterThan(hydrateIndex);
    expect(executeIndex).to.be.greaterThan(runtimeIndex);
    expect(workflow).to.contain("vars.V4_OPERATIONS_KEEPER_ENABLED == 'true'");
    expect(workflow).to.contain("vars.V4_LIQUIDITY_MAINTAINER_ENABLED == 'true'");
    expect(workflow).to.contain("vars.V4_COMPOUND_KEEPER_ADDRESS");
    expect(workflow).to.contain("secrets.V4_OPERATIONS_KEEPER_PRIVATE_KEY");
    expect(workflow).to.contain("vars.V4_COMPOUND_REFERENCE_SQRT_PRICE_X96");
    expect(workflow).to.contain("vars.V4_COMPOUND_MAX_NARA_USED_RAW");
    expect(workflow).to.contain("vars.V4_COMPOUND_MAX_USDC_USED_RAW");
    expect(workflow).to.contain("github.event_name == 'schedule' || inputs.execute == true");
    expect(workflow).to.contain('V4_COMPOUND_REQUIRE_HEARTBEAT: "true"');
    for (const key of [
      "V4_NARA_TOKEN",
      "V4_BASE_TOKEN",
      "V4_VAULT",
      "V4_HOOK",
      "V4_ENGINE",
      "V4_POOL_ID",
      "V4_LP_TOKEN_ID",
      "V4_COMPOUNDER",
      "V4_SAFE",
    ]) {
      expect(workflow).not.to.contain(`vars.${key}`);
    }
  });

  it("avoids duplicate feature-branch CI while preserving PR and main verification", () => {
    const workflow = source(".github/workflows/ci.yml");

    expect(workflow).to.match(/push:\s+branches:\s+- main/);
    expect(workflow).to.contain("pull_request:");
    expect(workflow).to.contain("workflow_dispatch:");
  });

  it("keeps protected CI coverage for the treasury range settler", () => {
    const workflow = source(".github/workflows/ci.yml");
    const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:treasury-range-settler:v4"])
      .to.equal("node --import tsx --test services/v4-treasury-range-settler/test/operations.test.ts");
    expect(packageJson.scripts["typecheck:treasury-range-settler:v4"])
      .to.equal("tsc --noEmit -p services/v4-treasury-range-settler/tsconfig.json");
    expect(workflow).to.contain("npm run test:treasury-range-settler:v4");
    expect(workflow).to.contain("npm run typecheck:treasury-range-settler:v4");
    expect(workflow).to.contain("contracts/v4/NARATreasuryRangeManagerV1.sol");
    expect(source("scripts/runSlitherV4.ps1"))
      .to.contain("contracts\\v4\\NARATreasuryRangeManagerV1.sol");
  });
});
