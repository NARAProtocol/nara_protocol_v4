/**
 * Read-only production-state simulation of 20 x 3 USDC NARA buys in one
 * atomic Universal Router transaction. The test forks Base and impersonates
 * the recorded test wallet only inside the local fork.
 */
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import type { Log, LogDescription } from "ethers";
import hre from "hardhat";
import {
  buildSameBlockBuyCall,
  SAME_BLOCK_BUY_COUNT,
  SAME_BLOCK_BUY_TOTAL_USDC,
  SAME_BLOCK_EXPECTED,
  SAME_BLOCK_EXPECTED_FEE_USDC,
} from "../../scripts/matrix/runV4LiveSameBlockBuyTaxMatrix.js";

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
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const VAULT_ABI = ["function totalBaseFeeRecorded() view returns (uint256)"];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

(hasRpc ? describe : describe.skip)(
  "deployed NARA v4 - 20 x 3 USDC same-block buy tax on Base fork",
  function () {
    it("executes twenty swap actions atomically and records 3.15 USDC of Hook fees", async function () {
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
      const buyer = await ethers.getSigner(SAME_BLOCK_EXPECTED.wallet);
      const usdc = new ethers.Contract(
        SAME_BLOCK_EXPECTED.base,
        ERC20_ABI,
        buyer
      );
      const nara = new ethers.Contract(
        SAME_BLOCK_EXPECTED.token,
        ERC20_ABI,
        buyer
      );
      const permit2 = new ethers.Contract(
        SAME_BLOCK_EXPECTED.permit2,
        PERMIT2_ABI,
        buyer
      );
      const router = new ethers.Contract(
        SAME_BLOCK_EXPECTED.universalRouter,
        ROUTER_ABI,
        buyer
      );
      const quoter = new ethers.Contract(
        SAME_BLOCK_EXPECTED.v4Quoter,
        QUOTER_ABI,
        buyer
      );
      const hook = new ethers.Contract(
        SAME_BLOCK_EXPECTED.hook,
        HOOK_ABI,
        buyer
      );
      const vault = new ethers.Contract(
        SAME_BLOCK_EXPECTED.vault,
        VAULT_ABI,
        buyer
      );

      const [usdcBefore, naraBefore, vaultBefore] = await Promise.all([
        usdc.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
        nara.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
        vault.totalBaseFeeRecorded() as Promise<bigint>,
      ]);
      expect(usdcBefore).to.be.greaterThanOrEqual(SAME_BLOCK_BUY_TOTAL_USDC);

      await (
        await usdc.approve(
          SAME_BLOCK_EXPECTED.permit2,
          SAME_BLOCK_BUY_TOTAL_USDC
        )
      ).wait();
      const latest = await ethers.provider.getBlock("latest");
      expect(latest).to.not.equal(null);
      await (
        await permit2.approve(
          SAME_BLOCK_EXPECTED.base,
          SAME_BLOCK_EXPECTED.universalRouter,
          SAME_BLOCK_BUY_TOTAL_USDC,
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
        zeroForOne: !tokenIsCurrency0,
        exactAmount: SAME_BLOCK_BUY_TOTAL_USDC,
        hookData: "0x",
      })) as [bigint, bigint];
      const amountOutMinimum = (aggregateQuote * 9_000n) / 10_000n;
      const executionBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt(executionBlock!.timestamp + 600);
      const atomicCall = buildSameBlockBuyCall(
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

      const [usdcAfter, naraAfter, vaultAfter, flowBlock, flowAmount] =
        await Promise.all([
          usdc.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
          nara.balanceOf(SAME_BLOCK_EXPECTED.wallet) as Promise<bigint>,
          vault.totalBaseFeeRecorded() as Promise<bigint>,
          hook.flowBlock(SAME_BLOCK_EXPECTED.base) as Promise<bigint>,
          hook.flowAmountInBlock(SAME_BLOCK_EXPECTED.base) as Promise<bigint>,
        ]);
      expect(usdcBefore - usdcAfter).to.equal(SAME_BLOCK_BUY_TOTAL_USDC);
      expect(naraAfter - naraBefore).to.be.greaterThanOrEqual(amountOutMinimum);
      expect(vaultAfter - vaultBefore).to.equal(SAME_BLOCK_EXPECTED_FEE_USDC);
      expect(flowBlock).to.equal(BigInt(receipt!.blockNumber));
      expect(flowAmount).to.equal(SAME_BLOCK_BUY_TOTAL_USDC);

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
            parsed?.args.isBuy === true
        );
      expect(feeEvents).to.have.length(SAME_BLOCK_BUY_COUNT);
      const totalFee = feeEvents.reduce(
        (sum: bigint, parsed: LogDescription) =>
          sum + (parsed.args.feeAmount as bigint),
        0n
      );
      expect(totalFee).to.equal(SAME_BLOCK_EXPECTED_FEE_USDC);

      console.log(
        JSON.stringify(
          {
            mode: "Base fork only; no production transaction",
            snapshotBlock: executionBlock!.number,
            transactionHash: receipt!.hash,
            receiptBlock: receipt!.blockNumber,
            swapActions: feeEvents.length,
            usdcSpent: ethers.formatUnits(usdcBefore - usdcAfter, 6),
            naraReceived: ethers.formatUnits(naraAfter - naraBefore, 18),
            hookFeeUsdc: ethers.formatUnits(totalFee, 6),
            forkGasUsed: receipt!.gasUsed.toString(),
          },
          null,
          2
        )
      );
    });
  }
);
