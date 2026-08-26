/**
 * Read-only historical Base-fork evidence for a single stabilizer candidate.
 *
 * Required opt-in inputs:
 *   V4_STABILIZER_ARCHIVE_RPC_URL
 *   V4_STABILIZER_FORK_BLOCK
 *   V4_STABILIZER_TRIGGER_BLOCK_HASH
 *   V4_STABILIZER_TRIGGER_TX_HASH
 *   V4_STABILIZER_EXPECTED_TRIGGER_SIDE=pump|floor
 *
 * The fork is pinned at the exact trigger block. The test reconstructs the
 * canonical PoolManager swap output, obtains an end-of-trigger-block mark,
 * mines one empty local-fork block, and obtains the actual next-block defense
 * quote with per-block Hook pressure reset. It never signs or sends a
 * production transaction.
 */
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import hre from "hardhat";
import { canonicalProductionV4Deployment } from "../../scripts/lib/v4LiveConfig.js";
import {
  BASE_V4_QUOTER,
  verifyProductionV4ReadOnlyRuntime,
} from "../../scripts/matrix/v4ReadOnlyPool.js";
import {
  reconstructCanonicalSwapFlow,
  V4_POOL_MANAGER_SWAP_TOPIC,
} from "../../scripts/matrix/stabilizerSwapFlow.js";

const QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];
const HEDGE_RATIO_BPS = 9_000n;
const FLOOR_DEFENSE_USDC = 150n * 10n ** 6n;

const archiveUrl = process.env.V4_STABILIZER_ARCHIVE_RPC_URL?.trim() ?? "";
const forkBlockText = process.env.V4_STABILIZER_FORK_BLOCK?.trim() ?? "";
const triggerBlockHash =
  process.env.V4_STABILIZER_TRIGGER_BLOCK_HASH?.trim() ?? "";
const triggerTxHash = process.env.V4_STABILIZER_TRIGGER_TX_HASH?.trim() ?? "";
const expectedSide =
  process.env.V4_STABILIZER_EXPECTED_TRIGGER_SIDE?.trim() ?? "";
const optInReady =
  archiveUrl !== "" &&
  /^\d+$/.test(forkBlockText) &&
  /^0x[0-9a-fA-F]{64}$/.test(triggerBlockHash) &&
  /^0x[0-9a-fA-F]{64}$/.test(triggerTxHash) &&
  (expectedSide === "pump" || expectedSide === "floor");

(optInReady ? describe : describe.skip)(
  "deployed NARA v4 - exact next-block stabilizer quote on historical Base fork",
  function () {
    it("reconstructs source output and quotes after one empty block", async function () {
      this.timeout(180_000);
      const triggerBlock = Number(forkBlockText);
      const deployment = canonicalProductionV4Deployment();
      const { ethers, networkName } = await hre.network.connect(
        "baseStabilizerArchiveFork"
      );
      expect(networkName).to.equal("baseStabilizerArchiveFork");
      expect((await ethers.provider.getNetwork()).chainId).to.equal(8453n);
      await verifyProductionV4ReadOnlyRuntime(ethers.provider, deployment);

      const snapshot = await ethers.provider.getBlock("latest");
      expect(snapshot?.number).to.equal(triggerBlock);
      expect(snapshot?.hash?.toLowerCase()).to.equal(
        triggerBlockHash.toLowerCase()
      );
      const receipt = await ethers.provider.getTransactionReceipt(
        triggerTxHash
      );
      expect(receipt).to.not.equal(null);
      expect(receipt!.blockNumber).to.equal(triggerBlock);
      expect(receipt!.blockHash.toLowerCase()).to.equal(
        snapshot!.hash!.toLowerCase()
      );

      const tokenIsCurrency0 =
        BigInt(deployment.token) < BigInt(deployment.base);
      const canonicalSwapLogs = receipt!.logs.filter(
        (log) =>
          log.address.toLowerCase() === deployment.poolManager.toLowerCase() &&
          log.topics[0]?.toLowerCase() === V4_POOL_MANAGER_SWAP_TOPIC &&
          log.topics[1]?.toLowerCase() === deployment.poolId.toLowerCase()
      );
      const sourceFlow = reconstructCanonicalSwapFlow(canonicalSwapLogs, {
        poolManager: deployment.poolManager,
        poolId: deployment.poolId,
        tokenIsCurrency0,
        expectedSide: expectedSide as "pump" | "floor",
        transactionHash: triggerTxHash,
      });
      const exactDefenseAmount =
        sourceFlow.side === "pump"
          ? (sourceFlow.naraOut * HEDGE_RATIO_BPS) / 10_000n
          : FLOOR_DEFENSE_USDC;
      expect(exactDefenseAmount).to.be.greaterThan(0n);

      const quoter = new ethers.Contract(
        BASE_V4_QUOTER,
        QUOTER_ABI,
        ethers.provider
      );
      const poolKey = {
        currency0: tokenIsCurrency0 ? deployment.token : deployment.base,
        currency1: tokenIsCurrency0 ? deployment.base : deployment.token,
        fee: deployment.poolFee,
        tickSpacing: deployment.tickSpacing,
        hooks: deployment.hook,
      };
      const defenseZeroForOne =
        sourceFlow.side === "pump" ? tokenIsCurrency0 : !tokenIsCurrency0;
      const quoteDefense = async (): Promise<[bigint, bigint]> =>
        (await quoter.quoteExactInputSingle.staticCall({
          poolKey,
          zeroForOne: defenseZeroForOne,
          exactAmount: exactDefenseAmount,
          hookData: "0x",
        })) as [bigint, bigint];

      const triggerBlockMark = await quoteDefense();
      await ethers.provider.send("hardhat_mine", ["0x1"]);
      const nextBlock = await ethers.provider.getBlock("latest");
      expect(nextBlock?.number).to.equal(triggerBlock + 1);
      const nextBlockQuote = await quoteDefense();
      expect(triggerBlockMark[0]).to.be.greaterThan(0n);
      expect(nextBlockQuote[0]).to.be.greaterThan(0n);
      expect(nextBlockQuote[1]).to.be.greaterThan(0n);

      console.log(
        JSON.stringify(
          {
            mode: "read-only historical Base fork; no production transaction",
            triggerTxHash,
            triggerBlock,
            triggerBlockHash: snapshot!.hash,
            sourceSide: sourceFlow.side,
            sourceUsdcIn: sourceFlow.usdcIn.toString(),
            sourceUsdcOut: sourceFlow.usdcOut.toString(),
            sourceNaraIn: sourceFlow.naraIn.toString(),
            sourceNaraOut: sourceFlow.naraOut.toString(),
            exactDefenseAmount: exactDefenseAmount.toString(),
            triggerBlockMarkOut: triggerBlockMark[0].toString(),
            nextBlock: nextBlock!.number,
            nextBlockHash: nextBlock!.hash,
            nextBlockQuoteOut: nextBlockQuote[0].toString(),
            nextBlockQuoteGasEstimate: nextBlockQuote[1].toString(),
          },
          null,
          2
        )
      );
    });
  }
);
