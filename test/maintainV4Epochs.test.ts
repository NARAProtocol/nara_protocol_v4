import { expect } from "chai";
import { ethers } from "ethers";
import {
  epochHealthStatus,
  parseMaintainerArgs,
  planEpochBatches,
  readHealthAtConfirmedBlock,
  untrackedDirectReserve,
} from "../scripts/maintainV4Epochs.js";

function mockHealthContracts(
  currentEpoch: (blockTag: number | undefined) => Promise<bigint>,
  observedBlockTags: Array<number | undefined>,
) {
  const read = <T>(value: T) => async (overrides: { blockTag?: number }) => {
    observedBlockTags.push(overrides.blockTag);
    return value;
  };
  const engine = {
    currentEpoch: async (overrides: { blockTag?: number }) => {
      observedBlockTags.push(overrides.blockTag);
      return currentEpoch(overrides.blockTag);
    },
    epochState: read({ epoch: 9n }),
    emissionReserve: read(0n),
    rewardReserveAvailable: read(650_000n),
    trackedEmissionReserve: read(0n),
    totalLocked: read(100n),
    totalPendingNaraRewards: read(0n),
    nextPositionId: read(3n),
  } as unknown as ethers.Contract;
  const nara = {
    balanceOf: async (_account: string, overrides: { blockTag?: number }) => {
      observedBlockTags.push(overrides.blockTag);
      return 100n;
    },
  } as unknown as ethers.Contract;
  return { engine, nara };
}

describe("v4 epoch maintainer", function () {
  it("plans the current 462-epoch recovery in bounded batches", function () {
    expect(planEpochBatches(462n, 100, 10)).to.deep.equal([100n, 100n, 100n, 100n, 62n]);
  });

  it("honors the maximum batch count", function () {
    expect(planEpochBatches(462n, 100, 3)).to.deep.equal([100n, 100n, 100n]);
  });

  it("distinguishes the external sealed reserve from direct untracked engine funds", function () {
    expect(untrackedDirectReserve(0n, 0n, 0n, 0n)).to.equal(0n);
    expect(untrackedDirectReserve(650_000n, 0n, 0n, 0n)).to.equal(650_000n);
    expect(untrackedDirectReserve(650_000n, 100_000n, 50_000n, 500_000n)).to.equal(0n);
  });

  it("classifies backlog against the engine JIT cap", function () {
    expect(epochHealthStatus(0n)).to.equal("current");
    expect(epochHealthStatus(8n)).to.equal("jit-recoverable");
    expect(epochHealthStatus(9n)).to.equal("writes-blocked");
  });

  it("defaults to read-only and validates execution bounds", function () {
    expect(parseMaintainerArgs([])).to.deep.equal({
      execute: false,
      batchSize: 100,
      maxBatches: 10,
      maxBacklog: undefined,
      confirmations: 1,
      syncUntrackedReserve: false,
    });
    expect(parseMaintainerArgs([
      "--execute", "--batch-size", "75", "--max-batches", "8", "--max-backlog", "8",
      "--confirmations", "2", "--sync-untracked-reserve",
    ])).to.deep.equal({
      execute: true,
      batchSize: 75,
      maxBatches: 8,
      maxBacklog: 8,
      confirmations: 2,
      syncUntrackedReserve: true,
    });
    expect(() => parseMaintainerArgs(["--batch-size", "151"]))
      .to.throw("--batch-size must be an integer between 1 and 150");
    expect(() => parseMaintainerArgs(["--max-backlog", "3001"]))
      .to.throw("--max-backlog must be an integer between 1 and 3000");
  });

  it("pins every post-receipt health read to the confirmed block", async function () {
    const observedBlockTags: Array<number | undefined> = [];
    const { engine, nara } = mockHealthContracts(async () => 10n, observedBlockTags);

    const health = await readHealthAtConfirmedBlock(
      engine,
      nara,
      "0x0000000000000000000000000000000000000001",
      50_055_995,
      { attempts: 1 },
    );

    expect(health.currentEpoch).to.equal(10n);
    expect(health.settledEpoch).to.equal(9n);
    expect(observedBlockTags).to.have.length(9);
    expect(observedBlockTags.every((blockTag) => blockTag === 50_055_995)).to.equal(true);
  });

  it("retries only the confirmed-block read when an RPC backend lags", async function () {
    const observedBlockTags: Array<number | undefined> = [];
    const waits: number[] = [];
    let readAttempts = 0;
    const { engine, nara } = mockHealthContracts(async () => {
      readAttempts += 1;
      if (readAttempts < 3) throw new Error("confirmed block is not indexed yet");
      return 10n;
    }, observedBlockTags);

    const health = await readHealthAtConfirmedBlock(
      engine,
      nara,
      "0x0000000000000000000000000000000000000001",
      50_055_995,
      {
        attempts: 3,
        delayMs: 25,
        wait: async (delayMs) => { waits.push(delayMs); },
      },
    );

    expect(health.settledEpoch).to.equal(9n);
    expect(readAttempts).to.equal(3);
    expect(waits).to.deep.equal([25, 25]);
    expect(observedBlockTags.every((blockTag) => blockTag === 50_055_995)).to.equal(true);
  });

  it("bounds confirmed-block retries and fails without changing state", async function () {
    const observedBlockTags: Array<number | undefined> = [];
    let readAttempts = 0;
    const { engine, nara } = mockHealthContracts(async () => {
      readAttempts += 1;
      throw new Error("confirmed block is not indexed yet");
    }, observedBlockTags);

    let failure: unknown;
    try {
      await readHealthAtConfirmedBlock(
        engine,
        nara,
        "0x0000000000000000000000000000000000000001",
        50_055_995,
        { attempts: 2, delayMs: 0, wait: async () => undefined },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message)
      .to.equal("Confirmed epoch state at block 50055995 remained unavailable after 2 attempts");
    expect(readAttempts).to.equal(2);
    expect(observedBlockTags.every((blockTag) => blockTag === 50_055_995)).to.equal(true);
  });
});
