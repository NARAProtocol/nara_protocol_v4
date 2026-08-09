import { expect } from "chai";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import {
  buildFreshEnvEntries,
  collectHistoricalManifestValues,
  envSyncDeployment,
  latestDeploymentFile,
  latestSeedLpTokenId,
  validateFresh,
} from "../scripts/syncV4FreshEnv.js";
import {
  BASE_POOL_MANAGER,
  deriveV4PoolKey,
} from "../scripts/lib/v4LiveConfig.js";

const FRESH = {
  token: "0x1000000000000000000000000000000000000101",
  engine: "0x1000000000000000000000000000000000000102",
  hook: "0x1000000000000000000000000000000000002088",
  vault: "0x1000000000000000000000000000000000000104",
  admin: "0x1000000000000000000000000000000000000105",
  deployer: "0x1000000000000000000000000000000000000106",
  treasury: "0x1000000000000000000000000000000000000107",
  reserve: "0x1000000000000000000000000000000000000108",
  compounder: "0x1000000000000000000000000000000000000109",
  launcher: "0x1000000000000000000000000000000000000110",
  create2Deployer: "0x1000000000000000000000000000000000000111",
};

function freshManifest(): Record<string, unknown> {
  const poolId = deriveV4PoolKey({
    token: FRESH.token,
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    hook: FRESH.hook,
    fee: 3000,
    tickSpacing: 60,
  }).poolId;

  return {
    chainId: "8453",
    originCommit: "a".repeat(40),
    deployer: FRESH.deployer,
    finalAdmin: FRESH.admin,
    custodySafe: FRESH.admin,
    treasury: FRESH.treasury,
    launcher: FRESH.launcher,
    token: FRESH.token,
    engine: FRESH.engine,
    engineDeploymentBlock: 50_000_000,
    deploymentReceipts: {
      engine: { transactionHash: `0x${"56".repeat(32)}`, blockNumber: 50_000_000 },
    },
    rewardReserve: FRESH.reserve,
    vault: FRESH.vault,
    create2HookDeployer: FRESH.create2Deployer,
    hook: FRESH.hook,
    hookInitCodeHash: `0x${"12".repeat(32)}`,
    safeCodeHash: `0x${"34".repeat(32)}`,
    runtimeCodeHashes: {
      safe: {
        address: FRESH.admin,
        codeHash: `0x${"34".repeat(32)}`,
      },
    },
    poolId,
    poolFee: 3000,
    tickSpacing: 60,
    lpTokenId: "0",
    compounder: FRESH.compounder,
  };
}

describe("fresh v4 env sync", () => {
  it("selects the newest post-activation manifest ahead of the core checkpoint", () => {
    const directory = mkdtempSync(join(tmpdir(), "nara-sync-activation-"));
    try {
      const activation = join(directory, "v4-production-activation-2026-08-09.json");
      writeFileSync(join(directory, "v4-base-usdc-latest.json"), "{}\n");
      writeFileSync(activation, "{}\n");

      expect(latestDeploymentFile(directory)).to.equal(activation);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses the explicit envSync view from a post-activation manifest", () => {
    const envSync = freshManifest();
    const activation = { schemaVersion: "1.0.0", envSync };

    expect(envSyncDeployment(activation)).to.equal(envSync);
    expect(envSyncDeployment(envSync)).to.equal(envSync);
  });

  it("always selects the canonical full-v4 manifest ahead of a replacement manifest", () => {
    const directory = mkdtempSync(join(tmpdir(), "nara-sync-select-"));
    try {
      const canonical = join(directory, "v4-base-usdc-latest.json");
      writeFileSync(canonical, "{}\n");
      writeFileSync(join(directory, "v4-liquidity-replacement-latest.json"), "{}\n");

      expect(latestDeploymentFile(directory)).to.equal(canonical);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never uses a replacement-liquidity manifest as an automatic fallback", () => {
    const directory = mkdtempSync(join(tmpdir(), "nara-sync-no-replacement-"));
    try {
      writeFileSync(join(directory, "v4-liquidity-replacement-latest.json"), "{}\n");

      expect(() => latestDeploymentFile(directory)).to.throw("No v4-base-usdc deployment log found");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts an LP token ID only from seed evidence linked to the same fresh core", () => {
    const directory = mkdtempSync(join(tmpdir(), "nara-sync-seed-link-"));
    try {
      const manifest = freshManifest();
      const matchingSeed = {
        chainId: manifest.chainId,
        token: manifest.token,
        hook: manifest.hook,
        vault: manifest.vault,
        engine: manifest.engine,
        poolId: manifest.poolId,
        lpTokenId: "7654321",
      };
      const seedPath = join(directory, "v4-liquidity-seed-latest.json");
      writeFileSync(seedPath, JSON.stringify(matchingSeed));

      expect(latestSeedLpTokenId(manifest, directory)).to.equal("7654321");

      writeFileSync(seedPath, JSON.stringify({ ...matchingSeed, hook: ethers.ZeroAddress }));
      expect(() => latestSeedLpTokenId(manifest, directory)).to.throw(
        "seed manifest that does not match the fresh core field: hook",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exports complete non-secret launch and evidence fields when the manifest provides them", () => {
    const manifest = freshManifest();
    const entries = buildFreshEnvEntries(manifest, "0");

    expect(entries.V4_NARA_TOKEN).to.equal(ethers.getAddress(FRESH.token));
    expect(entries.V4_ENGINE).to.equal(ethers.getAddress(FRESH.engine));
    expect(entries.V4_ADMIN_ADDRESS).to.equal(ethers.getAddress(FRESH.admin));
    expect(entries.V4_SAFE).to.equal(ethers.getAddress(FRESH.admin));
    expect(entries.V4_DEPLOYER).to.equal(ethers.getAddress(FRESH.deployer));
    expect(entries.V4_TREASURY_ADDRESS).to.equal(ethers.getAddress(FRESH.treasury));
    expect(entries.V4_REWARD_RESERVE).to.equal(ethers.getAddress(FRESH.reserve));
    expect(entries.V4_COMPOUNDER).to.equal(ethers.getAddress(FRESH.compounder));
    expect(entries.V4_COMPOUNDER_ADDRESS).to.equal(ethers.getAddress(FRESH.compounder));
    expect(entries.V4_ENGINE_DEPLOYMENT_BLOCK).to.equal("50000000");
    expect(entries.V4_ENGINE_DEPLOYMENT_TX_HASH).to.equal(`0x${"56".repeat(32)}`);
    expect(entries.V4_SAFE_CODEHASH).to.equal(`0x${"34".repeat(32)}`);
    expect(entries.V4_HOOK_INIT_CODE_HASH).to.equal(`0x${"12".repeat(32)}`);
    expect(entries.V4_RELEASE_COMMIT).to.equal("a".repeat(40));
    expect(entries).not.to.have.property("PRIVATE_KEY");
  });

  it("exports the Safe code hash from nested runtime evidence when the top-level alias is absent", () => {
    const manifest = freshManifest();
    delete manifest.safeCodeHash;

    const entries = buildFreshEnvEntries(manifest, "0");

    expect(entries.V4_SAFE_CODEHASH).to.equal(`0x${"34".repeat(32)}`);
  });

  it("rejects historical filenames and historical deployment states", () => {
    const manifest = freshManifest();
    const entries = buildFreshEnvEntries(manifest, "0");
    const emptyRetired = new Map<string, Set<string>>();

    expect(() => validateFresh(
      manifest,
      entries,
      "deployments/v4-liquidity-replacement-latest.json",
      emptyRetired,
    )).to.throw("historical liquidity/recovery manifest");

    expect(() => validateFresh(
      { ...manifest, liquidityStackStatus: "quarantined-after-incident" },
      entries,
      "deployments/v4-base-usdc-latest.json",
      emptyRetired,
    )).to.throw("historical/quarantined deployment state");
  });

  it("rejects values found in historical replacement evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "nara-sync-retired-values-"));
    try {
      writeFileSync(
        join(directory, "v4-liquidity-replacement-latest.json"),
        JSON.stringify({ token: FRESH.token }),
      );
      const retired = collectHistoricalManifestValues(directory);
      const manifest = freshManifest();
      const entries = buildFreshEnvEntries(manifest, "0");

      expect(() => validateFresh(
        manifest,
        entries,
        "deployments/v4-base-usdc-latest.json",
        retired,
      )).to.throw("retired incident-stack value(s): V4_NARA_TOKEN");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects non-Base manifests and malformed evidence", () => {
    const manifest = freshManifest();
    const entries = buildFreshEnvEntries(manifest, "0");
    const emptyRetired = new Map<string, Set<string>>();

    expect(() => validateFresh(
      { ...manifest, chainId: "84532" },
      entries,
      "deployments/v4-base-usdc-latest.json",
      emptyRetired,
    )).to.throw("Base mainnet chainId 8453");

    expect(() => buildFreshEnvEntries({ ...manifest, safeCodeHash: "0x1234" }, "0"))
      .to.throw("invalid bytes32 field: V4_SAFE_CODEHASH");
    expect(() => buildFreshEnvEntries({
      ...manifest,
      safeCodeHash: undefined,
      runtimeCodeHashes: { safe: { codeHash: "0x1234" } },
    }, "0")).to.throw("invalid bytes32 field: V4_SAFE_CODEHASH");
    expect(() => buildFreshEnvEntries({ ...manifest, originCommit: "abc" }, "0"))
      .to.throw("full 40-character Git commit");
  });

  it("rejects noncanonical infrastructure and missing immutable evidence", () => {
    const manifest = freshManifest();
    const emptyRetired = new Map<string, Set<string>>();
    const entries = buildFreshEnvEntries(manifest, "0");
    expect(() => validateFresh(
      manifest,
      { ...entries, V4_POOL_MANAGER: FRESH.token },
      "deployments/v4-base-usdc-latest.json",
      emptyRetired,
    )).to.throw("V4_POOL_MANAGER is not the canonical Base deployment");
    expect(entries.V4_POOL_MANAGER).to.equal(ethers.getAddress(BASE_POOL_MANAGER));

    const withoutReceipt = { ...manifest };
    delete withoutReceipt.engineDeploymentBlock;
    delete withoutReceipt.deploymentReceipts;
    const incomplete = buildFreshEnvEntries(withoutReceipt, "0");
    expect(() => validateFresh(
      withoutReceipt,
      incomplete,
      "deployments/v4-base-usdc-latest.json",
      emptyRetired,
    )).to.throw("missing required evidence: V4_ENGINE_DEPLOYMENT_BLOCK");
  });
});
