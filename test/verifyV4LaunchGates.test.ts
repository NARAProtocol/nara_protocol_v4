import { expect } from "chai";
import { ethers } from "ethers";
import {
  activeLegacyRoleHolders,
  activeRoleHoldersFromHistory,
  rewardNotifierHistoryLogs,
  runtimeCodeHashMatches,
} from "../scripts/verifyV4LaunchGates.js";

describe("v4 launch-gate role enumeration", function () {
  it("reconstructs every currently active holder from grant and revoke history", function () {
    const alice = "0x0000000000000000000000000000000000001001";
    const bob = "0x0000000000000000000000000000000000001002";
    const carol = "0x0000000000000000000000000000000000001003";

    expect(activeRoleHoldersFromHistory([
      { kind: "grant", account: alice },
      { kind: "grant", account: bob },
      { kind: "revoke", account: alice },
      { kind: "grant", account: carol },
      { kind: "revoke", account: bob },
      { kind: "grant", account: bob },
    ])).to.deep.equal([bob, carol]);
  });

  it("requires the exact approved Safe runtime code hash", function () {
    const code = "0x60006000f3";
    expect(runtimeCodeHashMatches(code, ethers.keccak256(code))).to.equal(true);
    expect(runtimeCodeHashMatches(code, ethers.keccak256("0x6001"))).to.equal(false);
    expect(runtimeCodeHashMatches("0x", ethers.keccak256(code))).to.equal(false);
    expect(runtimeCodeHashMatches(code, "0x1234")).to.equal(false);
  });

  it("rejects every configured legacy admin while allowing the Safe itself", function () {
    const safe = "0x0000000000000000000000000000000000001001";
    const deployer = "0x0000000000000000000000000000000000001002";
    const oldAdmin = "0x0000000000000000000000000000000000001003";

    expect(activeLegacyRoleHolders(safe, [
      { account: deployer, hasRole: false },
      { account: oldAdmin, hasRole: true },
      { account: safe, hasRole: true },
      { account: oldAdmin, hasRole: true },
    ])).to.deep.equal([oldAdmin]);
  });

  it("scans role history in bounded RPC-compatible block chunks", async function () {
    const requests: { fromBlock: number; toBlock: number }[] = [];
    const provider = {
      getBlockNumber: async () => 125,
      getLogs: async (filter: { fromBlock: number; toBlock: number }) => {
        requests.push({ fromBlock: filter.fromBlock, toBlock: filter.toBlock });
        return [];
      },
    } as unknown as ethers.Provider;

    const logs = await rewardNotifierHistoryLogs(
      provider,
      "0x0000000000000000000000000000000000001001",
      ethers.id("REWARD_NOTIFIER_ROLE"),
      100,
      10,
    );

    expect(logs).to.deep.equal([]);
    expect(requests).to.deep.equal([
      { fromBlock: 100, toBlock: 109 },
      { fromBlock: 110, toBlock: 119 },
      { fromBlock: 120, toBlock: 125 },
    ]);
  });

  it("rejects unsafe role-history chunk configuration", async function () {
    const provider = {
      getBlockNumber: async () => 100,
      getLogs: async () => [],
    } as unknown as ethers.Provider;

    let caught: unknown;
    try {
      await rewardNotifierHistoryLogs(
        provider,
        "0x0000000000000000000000000000000000001001",
        ethers.id("REWARD_NOTIFIER_ROLE"),
        100,
        10_001,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
    expect((caught as Error).message).to.equal(
      "V4_ROLE_LOG_CHUNK_BLOCKS must be between 1 and 10000",
    );
  });
});
