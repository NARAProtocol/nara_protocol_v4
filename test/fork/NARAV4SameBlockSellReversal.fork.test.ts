/**
 * Read-only latest-state Base fork simulation that sells the exact NARA output
 * from the production 20 x 3 USDC buy using 20 atomic sell actions.
 */
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import type { Log, LogDescription } from "ethers";
import hre from "hardhat";
import {
  SAME_BLOCK_EXPECTED,
  cumulativeFee,
  type FeeCurve,
} from "../../scripts/matrix/runV4LiveSameBlockBuyTaxMatrix.js";
import {
  buildSameBlockSellCall,
  REVERSAL_NARA_TOTAL,
  REVERSAL_SELL_COUNT,
} from "../../scripts/matrix/runV4LiveSameBlockSellReversal.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const PERMIT2_ABI = ["function approve(address,address,uint160,uint48)"];
const ROUTER_ABI = ["function execute(bytes,bytes[],uint256) payable"];
const QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];
const HOOK_ABI = [
  "function protocolDepth(address) view returns (uint256)",
  "function sellCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const VAULT_ABI = ["function totalTokenFeeRecorded() view returns (uint256)"];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

(hasRpc ? describe : describe.skip)(
  "deployed NARA v4 - same-block sell reversal on Base fork",
  function () {
    it("sells the exact fast-buy output across twenty actions", async function () {
      this.timeout(180_000);
      const { ethers, networkName } = await hre.network.connect("baseFork");
      expect(networkName).to.equal("baseFork");

      await ethers.provider.send("hardhat_impersonateAccount", [
        SAME_BLOCK_EXPECTED.wallet,
      ]);
      await ethers.provider.send("hardhat_setBalance", [
        SAME_BLOCK_EXPECTED.wallet,
        ethers.toQuantity(ethers.parseEther("1")),
      ]);
      const seller = await ethers.getSigner(SAME_BLOCK_EXPECTED.wallet);
      const nara = new ethers.Contract(
        SAME_BLOCK_EXPECTED.token,
        ERC20_ABI,
        seller
      );
      const usdc = new ethers.Contract(
        SAME_BLOCK_EXPECTED.base,
        ERC20_ABI,
        seller
      );
      const permit2 = new ethers.Contract(
        SAME_BLOCK_EXPECTED.permit2,
        PERMIT2_ABI,
        seller
      );
      const router = new ethers.Contract(
        SAME_BLOCK_EXPECTED.universalRouter,
        ROUTER_ABI,
        seller
      );
      const quoter = new ethers.Contract(
        SAME_BLOCK_EXPECTED.v4Quoter,
        QUOTER_ABI,
        seller
      );
      const hook = new ethers.Contract(
        SAME_BLOCK_EXPECTED.hook,
        HOOK_ABI,
        seller
      );
      const vault = new ethers.Contract(
        SAME_BLOCK_EXPECTED.vault,
        VAULT_ABI,
        seller
      );

      const [naraBefore, usdcBefore, vaultBefore, depth, curveResult] =
        await Promise.all([
          nara.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
          usdc.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
          vault.totalTokenFeeRecorded() as Promise<bigint>,
          hook.protocolDepth(SAME_BLOCK_EXPECTED.token) as Promise<bigint>,
          hook.sellCurve() as Promise<readonly bigint[]>,
        ]);
      expect(naraBefore).to.be.greaterThanOrEqual(REVERSAL_NARA_TOTAL);
      const curve = curveResult.slice(0, 8).map(BigInt) as unknown as FeeCurve;
      const expectedFee = cumulativeFee(curve, REVERSAL_NARA_TOTAL, depth);

      await (
        await nara.approve(SAME_BLOCK_EXPECTED.permit2, REVERSAL_NARA_TOTAL)
      ).wait();
      const latest = await ethers.provider.getBlock("latest");
      await (
        await permit2.approve(
          SAME_BLOCK_EXPECTED.token,
          SAME_BLOCK_EXPECTED.universalRouter,
          REVERSAL_NARA_TOTAL,
          BigInt(latest!.timestamp + 3_600)
        )
      ).wait();

      const tokenIsCurrency0 =
        BigInt(SAME_BLOCK_EXPECTED.token) < BigInt(SAME_BLOCK_EXPECTED.base);
      const [currency0, currency1] = tokenIsCurrency0
        ? [SAME_BLOCK_EXPECTED.token, SAME_BLOCK_EXPECTED.base]
        : [SAME_BLOCK_EXPECTED.base, SAME_BLOCK_EXPECTED.token];
      const [aggregateQuote] = (await quoter.quoteExactInputSingle.staticCall({
        poolKey: {
          currency0,
          currency1,
          fee: SAME_BLOCK_EXPECTED.fee,
          tickSpacing: SAME_BLOCK_EXPECTED.tickSpacing,
          hooks: SAME_BLOCK_EXPECTED.hook,
        },
        zeroForOne: tokenIsCurrency0,
        exactAmount: REVERSAL_NARA_TOTAL,
        hookData: "0x",
      })) as [bigint, bigint];
      const amountOutMinimum = (aggregateQuote * 9_000n) / 10_000n;
      const executionBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt(executionBlock!.timestamp + 600);
      const atomicCall = buildSameBlockSellCall(
        {
          token: SAME_BLOCK_EXPECTED.token,
          base: SAME_BLOCK_EXPECTED.base,
          hook: SAME_BLOCK_EXPECTED.hook,
          fee: SAME_BLOCK_EXPECTED.fee,
          tickSpacing: SAME_BLOCK_EXPECTED.tickSpacing,
        },
        amountOutMinimum,
        deadline
      );
      await router.execute.staticCall(
        atomicCall.commands,
        atomicCall.inputs,
        deadline
      );
      const gas = await router.execute.estimateGas(
        atomicCall.commands,
        atomicCall.inputs,
        deadline
      );
      const transaction = await router.execute(
        atomicCall.commands,
        atomicCall.inputs,
        deadline,
        { gasLimit: (gas * 120n) / 100n }
      );
      const receipt = await transaction.wait();
      expect(receipt?.status).to.equal(1);

      const [naraAfter, usdcAfter, vaultAfter, flowBlock, flowAmount] =
        await Promise.all([
          nara.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
          usdc.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
          vault.totalTokenFeeRecorded() as Promise<bigint>,
          hook.flowBlock(SAME_BLOCK_EXPECTED.token) as Promise<bigint>,
          hook.flowAmountInBlock(SAME_BLOCK_EXPECTED.token) as Promise<bigint>,
        ]);
      expect(naraBefore - naraAfter).to.equal(REVERSAL_NARA_TOTAL);
      expect(usdcAfter - usdcBefore).to.be.greaterThanOrEqual(amountOutMinimum);
      expect(vaultAfter - vaultBefore).to.equal(expectedFee);
      expect(flowBlock).to.equal(BigInt(receipt!.blockNumber));
      expect(flowAmount).to.equal(REVERSAL_NARA_TOTAL);

      const hookInterface = new ethersUtils.Interface(HOOK_ABI);
      const hookTopic = hookInterface.getEvent("PoolFeeTaken")!.topicHash;
      const feeEvents = receipt!.logs
        .filter(
          (log: Log) =>
            log.address.toLowerCase() ===
              SAME_BLOCK_EXPECTED.hook.toLowerCase() &&
            log.topics[0] === hookTopic
        )
        .map((log: Log) => hookInterface.parseLog(log))
        .filter(
          (parsed: LogDescription | null): parsed is LogDescription =>
            parsed?.args.isBuy === false
        );
      expect(feeEvents).to.have.length(REVERSAL_SELL_COUNT);
      expect(
        feeEvents.reduce(
          (sum: bigint, parsed: LogDescription) =>
            sum + (parsed.args.feeAmount as bigint),
          0n
        )
      ).to.equal(expectedFee);

      console.log(
        JSON.stringify(
          {
            mode: "Base fork only; no production transaction",
            snapshotBlock: executionBlock!.number,
            transactionHash: receipt!.hash,
            receiptBlock: receipt!.blockNumber,
            sellActions: feeEvents.length,
            naraSpent: ethers.formatUnits(naraBefore - naraAfter, 18),
            usdcReceived: ethers.formatUnits(usdcAfter - usdcBefore, 6),
            hookFeeNara: ethers.formatUnits(expectedFee, 18),
            forkGasUsed: receipt!.gasUsed.toString(),
          },
          null,
          2
        )
      );
    });
  }
);
