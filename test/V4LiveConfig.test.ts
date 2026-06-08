import { expect } from "chai";
import { ethers } from "ethers";
import {
  DEFAULT_V4_ENGINE,
  DEFAULT_V4_HOOK,
  DEFAULT_V4_NARA,
  DEFAULT_V4_POOL_ID,
  DEFAULT_V4_VAULT,
  currentV4Config,
} from "../scripts/lib/v4LiveConfig.js";

const LAUNCH_ENV_KEYS = [
  "V4_NARA_TOKEN",
  "V4_HOOK",
  "V4_LP_TOKEN_ID",
  "V4_POOL_ID",
  "V4_VAULT",
  "V4_ENGINE",
  "V4_ALLOW_RETIRED_DEFAULTS",
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

      expect(config.token).to.equal(ethers.getAddress(DEFAULT_V4_NARA));
      expect(config.hook).to.equal(ethers.getAddress(DEFAULT_V4_HOOK));
      expect(config.poolId).to.equal(DEFAULT_V4_POOL_ID);
      expect(config.vault).to.equal(ethers.getAddress(DEFAULT_V4_VAULT));
      expect(config.engine).to.equal(ethers.getAddress(DEFAULT_V4_ENGINE));
    });
  });

  it("uses explicit fresh launch env without the recovery flag", () => {
    withCleanLaunchEnv(() => {
      const fresh = {
        token: "0x0000000000000000000000000000000000000101",
        hook: "0x0000000000000000000000000000000000000102",
        vault: "0x0000000000000000000000000000000000000103",
        engine: "0x0000000000000000000000000000000000000104",
        lpTokenId: "987654321",
        poolId: `0x${"12".repeat(32)}`,
      };

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
    });
  });
});
