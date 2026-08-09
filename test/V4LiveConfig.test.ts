import { expect } from "chai";
import { ethers } from "ethers";
import {
  RETIRED_INCIDENT_V4_ENGINE,
  RETIRED_INCIDENT_V4_HOOK,
  RETIRED_INCIDENT_V4_NARA,
  RETIRED_INCIDENT_V4_POOL_ID,
  RETIRED_INCIDENT_V4_VAULT,
  REQUIRED_V4_HOOK_FLAGS,
  V4_HOOK_FLAG_MASK,
  assertCanonicalV4PoolConfig,
  currentV4Config,
  deriveV4PoolKey,
} from "../scripts/lib/v4LiveConfig.js";

const LAUNCH_ENV_KEYS = [
  "V4_NARA_TOKEN",
  "V4_HOOK",
  "V4_BASE_TOKEN",
  "V4_POOL_FEE",
  "V4_TICK_SPACING",
  "V4_LP_TOKEN_ID",
  "V4_POOL_ID",
  "V4_VAULT",
  "V4_ENGINE",
  "V4_ALLOW_RETIRED_DEFAULTS",
  "V4_ALLOW_QUARANTINED_STAGE_A",
] as const;

function withCleanLaunchEnv(run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of LAUNCH_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    run();
  } finally {
    for (const key of LAUNCH_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("v4 live config launch guards", () => {
  it("rejects retired incident-stack defaults unless recovery mode is explicit", () => {
    withCleanLaunchEnv(() => {
      expect(() => currentV4Config()).to.throw(
        "Missing env: V4_NARA_TOKEN. The built-in fallback is a retired incident-stack address.",
      );
    });
  });

  it("allows retired defaults only with the explicit recovery flag", () => {
    withCleanLaunchEnv(() => {
      process.env.V4_ALLOW_RETIRED_DEFAULTS = "1";

      const config = currentV4Config();

      expect(config.token).to.equal(ethers.getAddress(RETIRED_INCIDENT_V4_NARA));
      expect(config.hook).to.equal(ethers.getAddress(RETIRED_INCIDENT_V4_HOOK));
      expect(config.poolId).to.equal(RETIRED_INCIDENT_V4_POOL_ID);
      expect(config.vault).to.equal(ethers.getAddress(RETIRED_INCIDENT_V4_VAULT));
      expect(config.engine).to.equal(ethers.getAddress(RETIRED_INCIDENT_V4_ENGINE));
    });
  });

  it("uses explicit fresh launch env without the recovery flag", () => {
    withCleanLaunchEnv(() => {
      const fresh = {
        token: "0x0000000000000000000000000000000000000101",
        hook: "0x0000000000000000000000000000000000002088",
        vault: "0x0000000000000000000000000000000000000103",
        engine: "0x0000000000000000000000000000000000000104",
        lpTokenId: "987654321",
        poolId: "",
      };
      fresh.poolId = deriveV4PoolKey({
        token: fresh.token,
        base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        hook: fresh.hook,
        fee: 3000,
        tickSpacing: 60,
      }).poolId;

      process.env.V4_NARA_TOKEN = fresh.token;
      process.env.V4_HOOK = fresh.hook;
      process.env.V4_VAULT = fresh.vault;
      process.env.V4_ENGINE = fresh.engine;
      process.env.V4_LP_TOKEN_ID = fresh.lpTokenId;
      process.env.V4_POOL_ID = fresh.poolId;

      const config = currentV4Config();

      expect(config.token).to.equal(ethers.getAddress(fresh.token));
      expect(config.hook).to.equal(ethers.getAddress(fresh.hook));
      expect(config.vault).to.equal(ethers.getAddress(fresh.vault));
      expect(config.engine).to.equal(ethers.getAddress(fresh.engine));
      expect(config.lpTokenId).to.equal(BigInt(fresh.lpTokenId));
      expect(config.poolId).to.equal(fresh.poolId);
      expect(config.canonicalPoolKey.poolId).to.equal(fresh.poolId);
    });
  });

  it("derives the same sorted PoolKey for either token/base input order", () => {
    const lowToken = "0x0000000000000000000000000000000000000101";
    const highToken = "0xF000000000000000000000000000000000000101";
    const hook = "0x0000000000000000000000000000000000002088";
    const base = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    const lowKey = deriveV4PoolKey({ token: lowToken, base, hook, fee: 3000, tickSpacing: 60 });
    const highKey = deriveV4PoolKey({ token: highToken, base, hook, fee: 3000, tickSpacing: 60 });

    expect(lowKey.currency0).to.equal(ethers.getAddress(lowToken));
    expect(lowKey.currency1).to.equal(ethers.getAddress(base));
    expect(lowKey.tokenIsCurrency0).to.equal(true);
    expect(highKey.currency0).to.equal(ethers.getAddress(base));
    expect(highKey.currency1).to.equal(ethers.getAddress(highToken));
    expect(highKey.tokenIsCurrency0).to.equal(false);
  });

  it("rejects a Hook whose permission bits are not exactly 0x2088", () => {
    const input = {
      token: "0x0000000000000000000000000000000000000101",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      hook: "0x0000000000000000000000000000000000002080",
      fee: 3000,
      tickSpacing: 60,
      poolId: ethers.ZeroHash,
    };

    expect(BigInt(input.hook) & V4_HOOK_FLAG_MASK).not.to.equal(REQUIRED_V4_HOOK_FLAGS);
    expect(() => assertCanonicalV4PoolConfig(input)).to.throw(
      "V4_HOOK permission bits must equal 0x2088",
    );
  });

  it("rejects a poolId that was not derived from the configured PoolKey", () => {
    const input = {
      token: "0x0000000000000000000000000000000000000101",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      hook: "0x0000000000000000000000000000000000002088",
      fee: 3000,
      tickSpacing: 60,
      poolId: `0x${"12".repeat(32)}`,
    };

    expect(() => assertCanonicalV4PoolConfig(input)).to.throw(
      "V4_POOL_ID does not match the configured canonical PoolKey",
    );
  });

  it("rejects noncanonical fee and tick spacing before deriving a swap key", () => {
    const input = {
      token: "0x0000000000000000000000000000000000000101",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      hook: "0x0000000000000000000000000000000000002088",
      fee: 500,
      tickSpacing: 60,
      poolId: ethers.ZeroHash,
    };

    expect(() => assertCanonicalV4PoolConfig(input)).to.throw("V4_POOL_FEE must equal");
    expect(() => assertCanonicalV4PoolConfig({ ...input, fee: 3000, tickSpacing: 10 }))
      .to.throw("V4_TICK_SPACING must equal");
  });

  it("rejects the quarantined Stage A liquidity stack by default", () => {
    withCleanLaunchEnv(() => {
      process.env.V4_NARA_TOKEN = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
      process.env.V4_HOOK = "0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088";
      process.env.V4_VAULT = "0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988";
      process.env.V4_ENGINE = "0xbC2492BA73dE35d1114b5c18d7db633aca8963c9";
      process.env.V4_LP_TOKEN_ID = "0";
      process.env.V4_POOL_ID =
        "0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3";

      expect(() => currentV4Config()).to.throw(
        "Configured hook/pool belongs to the quarantined Stage A liquidity stack",
      );
    });
  });
});
