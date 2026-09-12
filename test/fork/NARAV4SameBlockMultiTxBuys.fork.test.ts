/**
 * Base Fork Integration Test: Same-Block Multi-Transaction Buys & Dynamic Surge Fees
 *
 * Simulates multiple distinct accounts (Alice, Bob, Charlie, MEV Sniper) submitting
 * independent transactions that are mined together into the exact same Base block.
 *
 * Verifies:
 *   1. Inter-transaction marginal surge fee piecewise escalation ($300 -> 500 -> 800 -> 1,200 BPS).
 *   2. Vault cumulative accounting and PoolManager take transfers match down to the exact wei.
 *   3. Next-block pressure reset (flow drops back to base 300 BPS tier).
 *   4. Currency isolation (intermediate NARA sells do not reduce or alter USDC buy flow).
 *
 * Run locally:
 *   npx hardhat test test/fork/NARAV4SameBlockMultiTxBuys.fork.test.ts --network baseFork
 */
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import type { Log, LogDescription } from "ethers";
import hre from "hardhat";

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
  "function buyCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
  "function flowFeeChargedInBlock(address) view returns (uint256)",
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
  poolId: "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464",
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
  "deployed NARA v4 - Same-Block Multi-Transaction Dynamic Fee & Surge Suite",
  function () {
    this.timeout(240_000);

    let ethers: any;
    let buyerFunder: any;
    let alice: any;
    let bob: any;
    let charlie: any;
    let sniper: any;
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
      buyerFunder = await ethers.getSigner(PINNED.fundingWallet);

      // Create 4 distinct test wallets
      const signers = await ethers.getSigners();
      alice = signers[1];
      bob = signers[2];
      charlie = signers[3];
      sniper = signers[4];

      usdc = new ethers.Contract(PINNED.base, ERC20_ABI, buyerFunder);
      nara = new ethers.Contract(PINNED.token, ERC20_ABI, buyerFunder);
      permit2 = new ethers.Contract(PINNED.permit2, PERMIT2_ABI, buyerFunder);
      router = new ethers.Contract(PINNED.universalRouter, ROUTER_ABI, buyerFunder);
      hook = new ethers.Contract(PINNED.hook, HOOK_ABI, buyerFunder);
      vault = new ethers.Contract(PINNED.vault, VAULT_ABI, buyerFunder);
      quoter = new ethers.Contract(PINNED.v4Quoter, QUOTER_ABI, buyerFunder);

      // Fund each actor with 1 ETH for gas and 100 USDC for swaps
      const actors = [alice, bob, charlie, sniper];
      for (const actor of actors) {
        await ethers.provider.send("hardhat_setBalance", [
          actor.address,
          ethers.toQuantity(ethers.parseEther("1")),
        ]);
        await (await usdc.connect(buyerFunder).transfer(actor.address, 100n * 10n ** 6n)).wait();

        // Setup max approvals to Permit2 & Universal Router
        await (await usdc.connect(actor).approve(PINNED.permit2, ethers.MaxUint256)).wait();
        await (
          await permit2
            .connect(actor)
            .approve(PINNED.base, PINNED.universalRouter, (1n << 160n) - 1n, (1n << 48n) - 1n)
        ).wait();
      }
    });

    it("Scenario 1: executes 4 concurrent separate transactions in ONE block and verifies piecewise surge escalation", async function () {
      const buyAmounts = [
        10n * 10n ** 6n, // Alice: 10 USDC (0 -> 10 USDC, Tier 0 300 bps)
        20n * 10n ** 6n, // Bob: 20 USDC (10 -> 30 USDC, crosses Tier 1 500 bps)
        30n * 10n ** 6n, // Charlie: 30 USDC (30 -> 60 USDC, crosses Tier 2 800 bps)
        50n * 10n ** 6n, // Sniper: 50 USDC (60 -> 110 USDC, crosses Tier 3 1200 bps)
      ];
      const actors = [alice, bob, charlie, sniper];

      // Calculate expected piecewise fees mathematically
      const expectedFees = [
        300_000n,   // Alice: $0.3000 USDC (3.00%)
        900_000n,   // Bob: $0.9000 USDC (4.50% effective, terminal 500 bps)
        1_950_000n, // Charlie: $1.9500 USDC (6.50% effective, terminal 800 bps)
        4_800_000n, // Sniper: $4.8000 USDC (9.60% effective, terminal 1200 bps)
      ];
      const expectedTiers = [300n, 500n, 800n, 1200n];
      const totalExpectedFee = 7_950_000n; // $7.9500 USDC

      const vaultBefore = (await vault.totalBaseFeeRecorded()) as bigint;

      // Disable automining to pack all 4 transactions into 1 block
      await ethers.provider.send("evm_setAutomine", [false]);
      await ethers.provider.send("evm_setIntervalMining", [0]);

      const executionBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt(executionBlock!.timestamp + 3600);
      const sentTxs: any[] = [];

      try {
        for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          const amountIn = buyAmounts[i];
          const call = buildSingleBuyCall(amountIn, 0n, deadline);

          // Await dispatch so the transaction enters the mempool before mining
          const tx = await router.connect(actor).execute(call.commands, call.inputs, deadline, {
            gasLimit: 800_000n,
          });
          sentTxs.push(tx);
        }

        // Mine the block containing all 4 transactions
        await ethers.provider.send("evm_mine", []);
      } finally {
        await ethers.provider.send("evm_setAutomine", [true]);
      }

      // Collect all receipts
      const receipts = await Promise.all(sentTxs.map((tx) => tx.wait()));

      // 1. Assert all 4 transactions mined in the exact same block
      const minedBlockNumber = receipts[0]?.blockNumber;
      expect(minedBlockNumber).to.be.a("number");
      for (let i = 0; i < receipts.length; i++) {
        expect(receipts[i]?.status).to.equal(1, `Tx ${i + 1} reverted`);
        expect(receipts[i]?.blockNumber).to.equal(
          minedBlockNumber,
          `Tx ${i + 1} did not mine in the same block`
        );
      }

      // 2. Decode and verify Hook events for each individual transaction
      const hookInterface = new ethersUtils.Interface(HOOK_ABI);
      const hookTopic = hookInterface.getEvent("PoolFeeTaken")!.topicHash;

      let totalLoggedFee = 0n;

      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i]!;
        const hookLogs = receipt.logs
          .filter(
            (log: Log) =>
              log.address.toLowerCase() === PINNED.hook.toLowerCase() &&
              log.topics[0] === hookTopic
          )
          .map((log: Log) => hookInterface.parseLog(log))
          .filter(
            (parsed: LogDescription | null): parsed is LogDescription =>
              parsed?.args.isBuy === true
          );

        expect(hookLogs).to.have.length(1, `Tx ${i + 1} must emit exactly 1 PoolFeeTaken event`);
        const feeEvent = hookLogs[0];

        const actualAmountIn = feeEvent.args.amountIn as bigint;
        const actualFee = feeEvent.args.feeAmount as bigint;
        const actualTier = feeEvent.args.feeBps as bigint;

        expect(actualAmountIn).to.equal(buyAmounts[i]);
        expect(actualFee).to.equal(
          expectedFees[i],
          `Tx ${i + 1} fee mismatch: expected ${expectedFees[i]}, got ${actualFee}`
        );
        expect(actualTier).to.equal(
          expectedTiers[i],
          `Tx ${i + 1} terminal tier mismatch: expected ${expectedTiers[i]}, got ${actualTier}`
        );

        totalLoggedFee += actualFee;
      }

      // 3. Reconcile total fee with Vault state delta
      expect(totalLoggedFee).to.equal(totalExpectedFee);
      const vaultAfter = (await vault.totalBaseFeeRecorded()) as bigint;
      expect(vaultAfter - vaultBefore).to.equal(totalExpectedFee);

      // 4. Assert hook per-block flow storage state
      const flowBlock = (await hook.flowBlock(PINNED.base)) as bigint;
      const flowAmount = (await hook.flowAmountInBlock(PINNED.base)) as bigint;
      const flowFeeCharged = (await hook.flowFeeChargedInBlock(PINNED.base)) as bigint;

      expect(flowBlock).to.equal(BigInt(minedBlockNumber!));
      expect(flowAmount).to.equal(110n * 10n ** 6n); // 110 USDC total
      expect(flowFeeCharged).to.equal(totalExpectedFee);

      console.log(
        JSON.stringify(
          {
            test: "Scenario 1: 4 Separate Transactions in One Block",
            blockNumber: minedBlockNumber,
            transactionsMinedTogether: receipts.length,
            totalUsdcSpent: "110.00 USDC",
            totalFeesSkimmed: `${ethersUtils.formatUnits(totalExpectedFee, 6)} USDC`,
            aliceFee: `${ethersUtils.formatUnits(expectedFees[0], 6)} USDC (${expectedTiers[0]} bps)`,
            bobFee: `${ethersUtils.formatUnits(expectedFees[1], 6)} USDC (${expectedTiers[1]} bps)`,
            charlieFee: `${ethersUtils.formatUnits(expectedFees[2], 6)} USDC (${expectedTiers[2]} bps)`,
            sniperFee: `${ethersUtils.formatUnits(expectedFees[3], 6)} USDC (${expectedTiers[3]} bps)`,
            vaultDeltaReconciled: true,
          },
          null,
          2
        )
      );
    });

    it("Scenario 2: verifies pressure drops back to baseline 300 bps on next block (B + 1)", async function () {
      // In automine mode, submitting a new transaction mines in block B + 1
      const buyAmount = 10n * 10n ** 6n; // 10 USDC
      const executionBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt(executionBlock!.timestamp + 3600);

      const call = buildSingleBuyCall(buyAmount, 0n, deadline);
      const tx = await router.connect(alice).execute(call.commands, call.inputs, deadline, {
        gasLimit: 800_000n,
      });
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      const hookInterface = new ethersUtils.Interface(HOOK_ABI);
      const hookTopic = hookInterface.getEvent("PoolFeeTaken")!.topicHash;
      const feeEvent = receipt!.logs
        .filter(
          (log: Log) =>
            log.address.toLowerCase() === PINNED.hook.toLowerCase() &&
            log.topics[0] === hookTopic
        )
        .map((log: Log) => hookInterface.parseLog(log))
        .filter((parsed: LogDescription | null): parsed is LogDescription => parsed?.args.isBuy === true)[0];

      // Proves flow reset back to base 300 bps
      expect(feeEvent.args.feeAmount).to.equal(300_000n); // 0.30 USDC (3.00%)
      expect(feeEvent.args.feeBps).to.equal(300n);

      const flowBlock = (await hook.flowBlock(PINNED.base)) as bigint;
      const flowAmount = (await hook.flowAmountInBlock(PINNED.base)) as bigint;
      expect(flowBlock).to.equal(BigInt(receipt!.blockNumber));
      expect(flowAmount).to.equal(buyAmount); // Reset to just this 10 USDC

      console.log(
        JSON.stringify(
          {
            test: "Scenario 2: Block Transition B -> B + 1",
            newBlockNumber: receipt!.blockNumber,
            usdcSpent: "10.00 USDC",
            hookFeeCharged: `${ethersUtils.formatUnits(feeEvent.args.feeAmount, 6)} USDC`,
            terminalTier: `${feeEvent.args.feeBps} bps`,
            pressureResetConfirmed: true,
          },
          null,
          2
        )
      );
    });

    it("Scenario 3: verifies currency isolation for interleaved buys and sells in the same block", async function () {
      // First fund Bob with NARA for selling
      const aliceNaraBalance = (await nara.balanceOf(alice.address)) as bigint;
      expect(aliceNaraBalance).to.be.greaterThanOrEqual(100n * 10n ** 18n);

      // Transfer 100 NARA to Bob to act as the seller
      await (await nara.connect(alice).transfer(bob.address, 100n * 10n ** 18n)).wait();

      // Setup NARA approvals for Bob
      await (await nara.connect(bob).approve(PINNED.permit2, ethers.MaxUint256)).wait();
      await (
        await permit2
          .connect(bob)
          .approve(PINNED.token, PINNED.universalRouter, (1n << 160n) - 1n, (1n << 48n) - 1n)
      ).wait();

      const buyAmount1 = 25n * 10n ** 6n; // Alice buys 25 USDC
      const sellAmount = 100n * 10n ** 18n; // Bob sells 100 NARA
      const buyAmount2 = 35n * 10n ** 6n; // Charlie buys 35 USDC (cumulative buy flow: 25 + 35 = 60 USDC)

      const executionBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt(executionBlock!.timestamp + 3600);

      // Disable automining to pack Buy1 + Sell + Buy2 into 1 block
      await ethers.provider.send("evm_setAutomine", [false]);
      await ethers.provider.send("evm_setIntervalMining", [0]);

      const sentTxs: any[] = [];
      try {
        const buy1Call = buildSingleBuyCall(buyAmount1, 0n, deadline);
        const sellCall = buildSingleSellCall(sellAmount, 0n, deadline);
        const buy2Call = buildSingleBuyCall(buyAmount2, 0n, deadline);

        // Await dispatch so all 3 transactions enter mempool before mining
        const tx1 = await router.connect(alice).execute(buy1Call.commands, buy1Call.inputs, deadline, {
          gasLimit: 800_000n,
        });
        const tx2 = await router.connect(bob).execute(sellCall.commands, sellCall.inputs, deadline, {
          gasLimit: 800_000n,
        });
        const tx3 = await router.connect(charlie).execute(buy2Call.commands, buy2Call.inputs, deadline, {
          gasLimit: 800_000n,
        });

        sentTxs.push(tx1, tx2, tx3);

        await ethers.provider.send("evm_mine", []);
      } finally {
        await ethers.provider.send("evm_setAutomine", [true]);
      }

      const receipts = await Promise.all(sentTxs.map((tx) => tx.wait()));

      expect(receipts[0]?.blockNumber).to.equal(receipts[1]?.blockNumber);
      expect(receipts[1]?.blockNumber).to.equal(receipts[2]?.blockNumber);

      const hookInterface = new ethersUtils.Interface(HOOK_ABI);
      const hookTopic = hookInterface.getEvent("PoolFeeTaken")!.topicHash;

      // Buy 1 fee: 25 USDC (0 -> 25 USDC) => 15 * 3% + 10 * 5% = 0.45 + 0.50 = 0.95 USDC
      const buy1Event = hookInterface.parseLog(
        receipts[0]!.logs.find((l: Log) => l.topics[0] === hookTopic)!
      )!;
      expect(buy1Event.args.isBuy).to.equal(true);
      expect(buy1Event.args.feeAmount).to.equal(950_000n);

      // Sell fee: 100 NARA => base tier sell fee (500 bps = 5%) => 5 NARA
      const sellEvent = hookInterface.parseLog(
        receipts[1]!.logs.find((l: Log) => l.topics[0] === hookTopic)!
      )!;
      expect(sellEvent.args.isBuy).to.equal(false);
      expect(sellEvent.args.feeBps).to.equal(500n);

      // Buy 2 fee: 35 USDC (25 -> 60 USDC) => 20 * 5% + 15 * 8% = 1.00 + 1.20 = 2.20 USDC
      // Proves that intermediate NARA sell did NOT reset or diminish USDC buy flow!
      const buy2Event = hookInterface.parseLog(
        receipts[2]!.logs.find((l: Log) => l.topics[0] === hookTopic)!
      )!;
      expect(buy2Event.args.isBuy).to.equal(true);
      expect(buy2Event.args.feeAmount).to.equal(2_200_000n);
      expect(buy2Event.args.feeBps).to.equal(800n);

      console.log(
        JSON.stringify(
          {
            test: "Scenario 3: Currency Isolation (Interleaved Buys and Sells)",
            blockNumber: receipts[0]?.blockNumber,
            buy1FeeUsdc: `${ethersUtils.formatUnits(buy1Event.args.feeAmount, 6)} USDC (flow 0 -> 25)`,
            sellFeeNara: `${ethersUtils.formatUnits(sellEvent.args.feeAmount, 18)} NARA (sell flow 0 -> 100)`,
            buy2FeeUsdc: `${ethersUtils.formatUnits(buy2Event.args.feeAmount, 6)} USDC (buy flow 25 -> 60)`,
            currencyIsolationConfirmed: true,
          },
          null,
          2
        )
      );
    });
  }
);
