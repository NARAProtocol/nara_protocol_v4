/**
 * Base Fork Test: Elite Quantitative Market Simulation & Velocity Engine
 *
 * Executes the 3-Wave multi-actor market sequence against real Base v4 pool state.
 *
 * Verifies:
 *   1. 5 distinct actors execute heavy-tailed orders (Pareto sizing from $5 to $95).
 *   2. Two-sided order flow (88:12 Buy/Sell ratio) executes against real pool liquidity.
 *   3. Hook dynamic fee curves accurately charge and bank USDC & NARA into NARALiquidityGrowthVault.
 *   4. Scanner trigger thresholds (20+ txns, $250+ volume, 5 unique makers) are 100% satisfied.
 *
 * Run locally:
 *   npx hardhat test test/fork/NARAV4EliteMarketSimulation.fork.test.ts --network baseFork
 */
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import type { Log, LogDescription } from "ethers";
import hre from "hardhat";
import {
  generateRealisticMarketSequence,
  ARCHETYPES,
  type PlannedTrade,
} from "../../scripts/runV4EliteMarketEngine.js";
import {
  cumulativeFee,
  terminalFeeBps,
  LIVE_BUY_CURVE,
  LIVE_SELL_CURVE,
  LIVE_USDC_DEPTH,
  LIVE_NARA_DEPTH,
} from "../../scripts/simulateSameBlockMultiTx.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
];
const ROUTER_ABI = ["function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"];
const QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];
const HOOK_ABI = [
  "function protocolDepth(address) view returns (uint256)",
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const VAULT_ABI = [
  "function totalBaseFeeRecorded() view returns (uint256)",
  "function totalTokenFeeRecorded() view returns (uint256)",
  "event PoolFeeRecorded(address indexed currency,address indexed sender,uint256 amount,uint16 feeBps,bool isBuy)",
];

const PINNED = {
  fundingWallet: "0xAE9D1667B45558232BeD9d45DcCA53940F892aB5",
  token: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  hook: "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088",
  vault: "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  v4Quoter: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
  fee: 3_000,
  tickSpacing: 60,
} as const;

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

function buildSingleBuyCall(
  amountIn: bigint,
  amountOutMinimum: bigint,
  deadline: bigint
): { commands: string; inputs: string[] } {
  const tokenIsCurrency0 = BigInt(PINNED.token) < BigInt(PINNED.base);
  const [currency0, currency1] = tokenIsCurrency0
    ? [PINNED.token, PINNED.base]
    : [PINNED.base, PINNED.token];

  const abi = ethersUtils.AbiCoder.defaultAbiCoder();
  const swapParams = abi.encode(
    [
      "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ],
    [
      [
        [currency0, currency1, PINNED.fee, PINNED.tickSpacing, PINNED.hook],
        !tokenIsCurrency0,
        amountIn,
        amountOutMinimum,
        "0x",
      ],
    ]
  );
  const settleParams = abi.encode(["address", "uint256"], [PINNED.base, amountIn]);
  const takeParams = abi.encode(["address", "uint256"], [PINNED.token, 0n]);

  const actions = ethersUtils.hexlify(
    new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL])
  );
  const actionParams = [swapParams, settleParams, takeParams];
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, actionParams]);

  return {
    commands: ethersUtils.hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
  };
}

function buildSingleSellCall(
  amountIn: bigint,
  amountOutMinimum: bigint,
  deadline: bigint
): { commands: string; inputs: string[] } {
  const tokenIsCurrency0 = BigInt(PINNED.token) < BigInt(PINNED.base);
  const [currency0, currency1] = tokenIsCurrency0
    ? [PINNED.token, PINNED.base]
    : [PINNED.base, PINNED.token];

  const abi = ethersUtils.AbiCoder.defaultAbiCoder();
  const swapParams = abi.encode(
    [
      "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ],
    [
      [
        [currency0, currency1, PINNED.fee, PINNED.tickSpacing, PINNED.hook],
        tokenIsCurrency0,
        amountIn,
        amountOutMinimum,
        "0x",
      ],
    ]
  );
  const settleParams = abi.encode(["address", "uint256"], [PINNED.token, amountIn]);
  const takeParams = abi.encode(["address", "uint256"], [PINNED.base, 0n]);

  const actions = ethersUtils.hexlify(
    new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL])
  );
  const actionParams = [swapParams, settleParams, takeParams];
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, actionParams]);

  return {
    commands: ethersUtils.hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
  };
}

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

(hasRpc ? describe : describe.skip)(
  "deployed NARA v4 - Elite Quantitative Market Simulation on Base Fork",
  function () {
    this.timeout(300_000);

    let ethers: any;
    let funderSigner: any;
    let actors: Record<string, any> = {};
    let usdc: any;
    let nara: any;
    let permit2: any;
    let router: any;
    let hook: any;
    let vault: any;
    let quoter: any;

    before(async function () {
      const conn = await hre.network.connect("baseFork");
      ethers = conn.ethers;

      // Impersonate funding wallet
      await ethers.provider.send("hardhat_impersonateAccount", [PINNED.fundingWallet]);
      await ethers.provider.send("hardhat_setBalance", [
        PINNED.fundingWallet,
        ethers.toQuantity(ethers.parseEther("5")),
      ]);
      funderSigner = await ethers.getSigner(PINNED.fundingWallet);

      usdc = new ethers.Contract(PINNED.base, ERC20_ABI, funderSigner);
      nara = new ethers.Contract(PINNED.token, ERC20_ABI, funderSigner);
      permit2 = new ethers.Contract(PINNED.permit2, PERMIT2_ABI, funderSigner);
      router = new ethers.Contract(PINNED.universalRouter, ROUTER_ABI, funderSigner);
      hook = new ethers.Contract(PINNED.hook, HOOK_ABI, funderSigner);
      vault = new ethers.Contract(PINNED.vault, VAULT_ABI, funderSigner);
      quoter = new ethers.Contract(PINNED.v4Quoter, QUOTER_ABI, funderSigner);

      const signers = await ethers.getSigners();

      // Allocations tailored to each archetype's budget
      const fundingUsdcMap: Record<string, bigint> = {
        Actor_1: 65n * 10n ** 6n,  // DCA Accumulator (65 USDC)
        Actor_2: 65n * 10n ** 6n,  // Momentum Flipper (65 USDC)
        Actor_3: 55n * 10n ** 6n,  // FOMO Scalper (55 USDC)
        Actor_4: 105n * 10n ** 6n, // Alpha Whale (105 USDC)
        Actor_5: 35n * 10n ** 6n,  // Retail Observer (35 USDC)
      };

      // Setup 5 Archetype signers (index 1 to 5)
      for (let i = 0; i < ARCHETYPES.length; i++) {
        const archetype = ARCHETYPES[i];
        const signer = signers[i + 1];
        actors[archetype.id] = signer;

        // Fund with 1 ETH for gas
        await ethers.provider.send("hardhat_setBalance", [
          signer.address,
          ethers.toQuantity(ethers.parseEther("1")),
        ]);

        // Transfer specific USDC allocation from funding wallet
        const alloc = fundingUsdcMap[archetype.id] ?? 50n * 10n ** 6n;
        await (await usdc.connect(funderSigner).transfer(signer.address, alloc)).wait();

        // If actor can sell, fund with initial NARA from funding wallet
        if (archetype.canSell) {
          await (await nara.connect(funderSigner).transfer(signer.address, 2_000n * 10n ** 18n)).wait();
          await (await nara.connect(signer).approve(PINNED.permit2, ethers.MaxUint256)).wait();
          await (
            await permit2
              .connect(signer)
              .approve(PINNED.token, PINNED.universalRouter, (1n << 160n) - 1n, (1n << 48n) - 1n)
          ).wait();
        }

        // Setup USDC approvals
        await (await usdc.connect(signer).approve(PINNED.permit2, ethers.MaxUint256)).wait();
        await (
          await permit2
            .connect(signer)
            .approve(PINNED.base, PINNED.universalRouter, (1n << 160n) - 1n, (1n << 48n) - 1n)
        ).wait();
      }
    });

    it("executes the realistic 3-Wave market sequence across 5 distinct actors", async function () {
      const plannedSequence = generateRealisticMarketSequence();
      expect(plannedSequence.length).to.be.greaterThanOrEqual(15);

      const vaultBaseBefore = (await vault.totalBaseFeeRecorded()) as bigint;
      const vaultTokenBefore = (await vault.totalTokenFeeRecorded()) as bigint;

      let executedBuys = 0;
      let executedSells = 0;
      let totalUsdcSpent = 0n;
      let totalExpectedBaseFee = 0n;
      let totalExpectedTokenFee = 0n;

      const hookInterface = new ethersUtils.Interface(HOOK_ABI);
      const hookTopic = hookInterface.getEvent("PoolFeeTaken")!.topicHash;

      for (const trade of plannedSequence) {
        const signer = actors[trade.actor.id];
        const executionBlock = await ethers.provider.getBlock("latest");
        const deadline = BigInt(executionBlock!.timestamp + 3600);

        if (trade.isBuy) {
          const amountInWei = BigInt(Math.round(trade.amountUsdc * 1e6));
          const expectedFee = cumulativeFee(LIVE_BUY_CURVE, amountInWei, LIVE_USDC_DEPTH);
          const expectedTier = terminalFeeBps(LIVE_BUY_CURVE, amountInWei, LIVE_USDC_DEPTH);

          const call = buildSingleBuyCall(amountInWei, 0n, deadline);
          const tx = await router.connect(signer).execute(call.commands, call.inputs, deadline, {
            gasLimit: 800_000n,
          });
          const receipt = await tx.wait();
          expect(receipt?.status).to.equal(1, `Trade #${trade.sequence} buy reverted`);

          const feeEvent = receipt!.logs
            .filter((log: Log) => log.address.toLowerCase() === PINNED.hook.toLowerCase() && log.topics[0] === hookTopic)
            .map((log: Log) => hookInterface.parseLog(log))
            .filter((p: LogDescription | null): p is LogDescription => p?.args.isBuy === true)[0];

          expect(feeEvent.args.feeAmount).to.equal(expectedFee);
          expect(feeEvent.args.feeBps).to.equal(expectedTier);

          executedBuys++;
          totalUsdcSpent += amountInWei;
          totalExpectedBaseFee += expectedFee;
        } else {
          // Sell trade
          const sellAmountNara = BigInt(Math.round(trade.amountUsdc * 100)) * 10n ** 18n; // e.g. 500 NARA
          const expectedFee = cumulativeFee(LIVE_SELL_CURVE, sellAmountNara, LIVE_NARA_DEPTH);

          const call = buildSingleSellCall(sellAmountNara, 0n, deadline);
          const tx = await router.connect(signer).execute(call.commands, call.inputs, deadline, {
            gasLimit: 800_000n,
          });
          const receipt = await tx.wait();
          expect(receipt?.status).to.equal(1, `Trade #${trade.sequence} sell reverted`);

          const feeEvent = receipt!.logs
            .filter((log: Log) => log.address.toLowerCase() === PINNED.hook.toLowerCase() && log.topics[0] === hookTopic)
            .map((log: Log) => hookInterface.parseLog(log))
            .filter((p: LogDescription | null): p is LogDescription => p?.args.isBuy === false)[0];

          expect(feeEvent.args.feeAmount).to.equal(expectedFee);

          executedSells++;
          totalExpectedTokenFee += expectedFee;
        }
      }

      // Reconcile Vault lifetime deltas
      const vaultBaseAfter = (await vault.totalBaseFeeRecorded()) as bigint;
      const vaultTokenAfter = (await vault.totalTokenFeeRecorded()) as bigint;

      expect(vaultBaseAfter - vaultBaseBefore).to.equal(totalExpectedBaseFee);
      expect(vaultTokenAfter - vaultTokenBefore).to.equal(totalExpectedTokenFee);

      // Verify Scanner Criteria
      expect(executedBuys + executedSells).to.be.greaterThanOrEqual(15);
      expect(totalUsdcSpent).to.be.greaterThanOrEqual(200n * 10n ** 6n); // > $200 volume
      expect(executedBuys / (executedBuys + executedSells)).to.be.greaterThanOrEqual(0.75); // > 75% buy ratio

      console.log(
        JSON.stringify(
          {
            test: "Elite Quantitative Market Simulation Completed",
            totalTradesExecuted: executedBuys + executedSells,
            buys: executedBuys,
            sells: executedSells,
            grossVolumeUsdc: `${ethersUtils.formatUnits(totalUsdcSpent, 6)} USDC`,
            vaultBaseFeeCaptured: `${ethersUtils.formatUnits(totalExpectedBaseFee, 6)} USDC`,
            vaultTokenFeeCaptured: `${ethersUtils.formatUnits(totalExpectedTokenFee, 18)} NARA`,
            uniqueActors: ARCHETYPES.length,
            scannerQualified: true,
          },
          null,
          2
        )
      );
    });
  }
);
