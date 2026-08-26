import { readFileSync } from "node:fs";
import { expect } from "chai";

describe("v4 stabilizer historical fork configuration", () => {
  const config = readFileSync("hardhat.config.ts", "utf8");

  it("requires an explicit archive RPC and exact trigger block", () => {
    expect(config).to.contain("V4_STABILIZER_ARCHIVE_RPC_URL");
    expect(config).to.contain("V4_STABILIZER_FORK_BLOCK");
    expect(config).to.contain(
      "V4_STABILIZER_FORK_BLOCK must be set to the exact trigger block"
    );
  });

  it("keeps historical EV evidence separate from the latest-state fork", () => {
    expect(config).to.contain("baseStabilizerArchiveFork");
    expect(config).to.contain("url: BASE_STABILIZER_ARCHIVE_RPC_URL");
    expect(config).to.contain("blockNumber: BASE_STABILIZER_FORK_BLOCK");
  });
});
