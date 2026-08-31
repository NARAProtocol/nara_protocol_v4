/**
 * Exact adversarial Base-fork matrix for the NARA treasury range manager.
 * Every mutation is confined to a fresh snapshot of the pinned local fork.
 */
import { expect } from "chai";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers as ethersUtils } from "ethers";
import hre from "hardhat";
import {
  canonicalProductionV4Deployment,
  deriveV4PoolKey,
} from "../../scripts/lib/v4LiveConfig.js";
import {
  getSqrtPriceAtTick,
} from "../../scripts/lib/v4TreasuryRangeMath.js";
import {
  NARA_UNIT,
  TREASURY_RANGE_NOMINAL_USDC_BUDGET,
  USDC_UNIT,
  oneSidedAcrossHumanPriceBand,
  priceBand,
  rescaleStrategyProfile,
  type PlannedStrategyProfile,
} from "../../scripts/lib/v4TreasuryRangePlanner.js";
import { readV4TreasuryRangeState } from "../../scripts/lib/v4TreasuryRangeState.js";
import {
  TREASURY_RANGE_CANARY_CHANGE_ID_PREFIX,
  TREASURY_RANGE_STRATEGY_SCHEMA,
  assertTreasuryRangeCanaryLaunchManifest,
  assertTreasuryRangeCanarySafeFunding,
  assertTreasuryRangeManifestExactEvidence,
  parseTreasuryRangeStrategyManifest,
} from "../../scripts/lib/v4TreasuryRangeManifest.js";
import { bindTreasuryRangeMatrixRows } from "../../scripts/lib/v4TreasuryRangeEvidence.js";
import {
  UNIVERSAL_ROUTER_ABI,
  buildV4ExactInputCall,
  cumulativeHookFee,
  incrementalHookFees,
  parseV4SwapReceipt,
} from "../../scripts/lib/v4TreasuryRangeSwap.js";
import {
  PINNED_USDC_ADVERSARY,
  requiresHistoricalPinnedUsdcAdversaryBalance,
  REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS,
  REQUIRED_BUY_SIZES_USDC,
  REQUIRED_INDEPENDENT_SELL_SIZES_NARA,
  buildTreasuryRangeScenarioPlan,
  canonicalJson,
  currentRepositoryHead,
  executeExactForkSwap,
  finalizeTreasuryRangeProfile,
  fundForkAccountFromPinnedUsdcAdversary,
  fundForkAccountFromTreasury,
} from "../../scripts/simulateV4TreasuryRanges.js";
import {
  optimizeTreasuryRanges,
  REQUIRED_NARA_BUDGETS,
  type ExactForkCandidateMetrics,
} from "../../scripts/optimizeV4TreasuryRanges.js";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
] as const;
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
] as const;
const MANAGER_ABI = [
  "function createSellNaraOrder(int24,int24,uint128,uint128,bytes32,uint64) returns (uint256,uint256)",
  "function createBuyNaraOrder(int24,int24,uint128,uint128,bytes32,uint64) returns (uint256,uint256)",
  "function getActiveOrderIds(uint256,uint256) view returns (uint256[] ids,uint256 nextOffset)",
  "function getOrder(uint256) view returns (uint256 tokenId,uint256 inputAmount,uint256 minimumOutputAmount,bytes32 strategyHash,uint128 liquidity,int24 tickLower,int24 tickUpper,uint64 createdBlock,uint64 creationDeadline,uint64 terminalBlock,uint8 side,uint8 status)",
  "function isSettleable(uint256) view returns (bool)",
  "function previewSettlement(uint256) view returns (bool settleable,uint256 principalNara,uint256 principalUsdc,uint256 minimumOutputAmount)",
  "function settle(uint256) returns (uint256 naraOut,uint256 usdcOut)",
  "function settleMany(uint256[]) returns (uint256 totalNaraOut,uint256 totalUsdcOut)",
] as const;
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function getPositionLiquidity(uint256) view returns (uint128)",
] as const;

type Connection = {
  ethers: {
    provider: ethersUtils.JsonRpcApiProvider;
    getSigners(): Promise<ethersUtils.Signer[]>;
    getSigner(address: string): Promise<ethersUtils.JsonRpcSigner>;
    deployContract(
      name: string,
      args: readonly unknown[],
      signer?: ethersUtils.Signer,
    ): Promise<ethersUtils.BaseContract>;
  };
  networkName: string;
};

type EvidenceRow = Readonly<Record<string, unknown>>;

const hasPinnedArchiveRpc = Boolean(
  (process.env.BASE_MAINNET_RPC_URL || process.env.BASE_RPC_URL)
  && process.env.V4_TREASURY_FORK_BLOCK?.trim(),
);

(hasPinnedArchiveRpc ? describe : describe.skip)("NARA treasury range attack matrix - pinned Base fork", function () {
  this.timeout(1_800_000);
  const deployment = canonicalProductionV4Deployment();
  let connection: Connection;
  let pinnedState: Awaited<ReturnType<typeof readV4TreasuryRangeState>>;
  let scenarioPlan: ReturnType<typeof buildTreasuryRangeScenarioPlan>;
  let rootSnapshot: string;

  const snapshot = () => connection.ethers.provider.send("evm_snapshot", []) as Promise<string>;
  const revertTo = async (id: string) => {
    expect(await connection.ethers.provider.send("evm_revert", [id])).to.equal(true);
    return snapshot();
  };

  before(async function () {
    connection = await hre.network.connect("baseFork") as unknown as Connection;
    expect(connection.networkName).to.equal("baseFork");
    const pinnedBlock = BigInt(process.env.V4_TREASURY_FORK_BLOCK!.trim());
    const latest = await connection.ethers.provider.getBlock("latest");
    expect(BigInt(latest!.number)).to.equal(pinnedBlock);
    pinnedState = await readV4TreasuryRangeState(connection.ethers.provider, { blockNumber: pinnedBlock });
    scenarioPlan = buildTreasuryRangeScenarioPlan(
      pinnedState,
      BigInt(latest!.timestamp) + 86_400n,
      currentRepositoryHead(),
    );
    rootSnapshot = await snapshot();
  });

  async function pinnedPermanentState() {
    const positions = new ethersUtils.Contract(
      deployment.positionManager,
      POSITION_MANAGER_ABI,
      connection.ethers.provider,
    );
    return Promise.all(pinnedState.permanentPositions.map(async (position) => ({
      tokenId: position.tokenId,
      owner: await positions.ownerOf(position.tokenId) as string,
      liquidity: await positions.getPositionLiquidity(position.tokenId) as bigint,
    })));
  }

  async function assertPermanentStateUnchanged(before: Awaited<ReturnType<typeof pinnedPermanentState>>) {
    const positions = new ethersUtils.Contract(
      deployment.positionManager,
      POSITION_MANAGER_ABI,
      connection.ethers.provider,
    );
    for (const position of before) {
      expect(await positions.ownerOf(position.tokenId)).to.equal(position.owner);
      expect(await positions.getPositionLiquidity(position.tokenId)).to.equal(position.liquidity);
    }
  }

  async function deployProfile(profile: PlannedStrategyProfile) {
    const [deployer] = await connection.ethers.getSigners();
    const latest = await connection.ethers.provider.getBlock("latest");
    const deadline = BigInt(latest!.timestamp) + 86_400n;
    const manager = await connection.ethers.deployContract("NARATreasuryRangeManagerV1", [
      deployment.safe,
      deployment.token,
      deployment.base,
      deployment.vault,
      deployment.poolManager,
      deployment.positionManager,
      deployment.permit2,
      deployment.hook,
      deployment.poolFee,
      deployment.tickSpacing,
      deployment.poolId,
      deadline,
    ], deployer);
    await manager.waitForDeployment();
    const managerAddress = await manager.getAddress();
    await fundForkAccountFromTreasury({
      provider: connection.ethers.provider,
      deployment,
      recipient: deployment.safe,
      token: deployment.token,
      amount: profile.totalNaraInput,
    });
    await fundForkAccountFromTreasury({
      provider: connection.ethers.provider,
      deployment,
      recipient: deployment.safe,
      token: deployment.base,
      amount: profile.exposedUsdcInput,
    });
    await connection.ethers.provider.send("hardhat_impersonateAccount", [deployment.safe]);
    await connection.ethers.provider.send(
      "hardhat_setBalance",
      [deployment.safe, ethersUtils.toQuantity(ethersUtils.parseEther("25"))],
    );
    const safe = await connection.ethers.getSigner(deployment.safe);
    const nara = new ethersUtils.Contract(deployment.token, ERC20_ABI, safe);
    const usdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, safe);
    await (await nara.approve(managerAddress, profile.totalNaraInput)).wait();
    await (await usdc.approve(managerAddress, profile.exposedUsdcInput)).wait();
    const boundManager = new ethersUtils.Contract(managerAddress, MANAGER_ABI, safe);
    for (const order of profile.orders) {
      const create = order.side === "SELL_NARA" ? "createSellNaraOrder" : "createBuyNaraOrder";
      await (await boundManager[create](
        order.tickLower,
        order.tickUpper,
        order.inputAmount,
        order.minimumOutputAmount,
        profile.strategyHash,
        deadline,
      )).wait();
    }
    await connection.ethers.provider.send("hardhat_stopImpersonatingAccount", [deployment.safe]);
    const reader = new ethersUtils.Contract(managerAddress, MANAGER_ABI, deployer);
    const [ids] = await reader.getActiveOrderIds(0n, 100n) as readonly [readonly bigint[], bigint];
    expect(ids).to.have.length(profile.orders.length);
    return { manager: reader, ids };
  }

  async function fundUsdc(recipient: string, amount: bigint) {
    await fundForkAccountFromPinnedUsdcAdversary({
      provider: connection.ethers.provider,
      deployment,
      recipient,
      amount,
      requirePristinePinnedBalance: requiresHistoricalPinnedUsdcAdversaryBalance(pinnedState.blockNumber),
    });
  }

  async function executeSameBlockBuys(signer: ethersUtils.Signer, amountEach: bigint) {
    const signerAddress = await signer.getAddress();
    const total = amountEach * 2n;
    await fundUsdc(signerAddress, total);
    const latest = await connection.ethers.provider.getBlock("latest");
    const deadline = BigInt(latest!.timestamp) + 3_600n;
    const poolKey = deriveV4PoolKey({
      token: deployment.token,
      base: deployment.base,
      hook: deployment.hook,
      fee: deployment.poolFee,
      tickSpacing: deployment.tickSpacing,
    });
    const call = buildV4ExactInputCall({
      poolKey,
      inputCurrency: deployment.base,
      legs: [{ amountIn: amountEach, amountOutMinimum: 0n }],
      aggregateAmountOutMinimum: 0n,
      deadline,
    });
    const usdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, signer);
    const permit2 = new ethersUtils.Contract(deployment.permit2, PERMIT2_ABI, signer);
    const router = new ethersUtils.Contract(deployment.universalRouter, UNIVERSAL_ROUTER_ABI, signer);
    await (await usdc.approve(deployment.permit2, total)).wait();
    await (await permit2.approve(deployment.base, deployment.universalRouter, total, deadline)).wait();
    const nonce = await signer.getNonce("pending");
    await connection.ethers.provider.send("evm_setAutomine", [false]);
    let first: ethersUtils.ContractTransactionResponse | undefined;
    let second: ethersUtils.ContractTransactionResponse | undefined;
    try {
      first = await router.execute(call.commands, call.inputs, call.deadline, { nonce, gasLimit: 3_000_000n });
      second = await router.execute(call.commands, call.inputs, call.deadline, { nonce: nonce + 1, gasLimit: 3_000_000n });
      await connection.ethers.provider.send("evm_mine", []);
    } finally {
      await connection.ethers.provider.send("evm_setAutomine", [true]);
    }
    const [firstReceipt, secondReceipt] = await Promise.all([first!.wait(), second!.wait()]);
    expect(firstReceipt!.status).to.equal(1);
    expect(secondReceipt!.status).to.equal(1);
    expect(firstReceipt!.blockNumber).to.equal(secondReceipt!.blockNumber);
    const parsed = [firstReceipt!, secondReceipt!].map((receipt) => parseV4SwapReceipt(receipt.logs, {
      poolManager: deployment.poolManager,
      hook: deployment.hook,
    }, deployment.poolId));
    const observedFees = parsed.map((value) => value.hookFeeByCurrency.get(deployment.base) ?? 0n);
    expect(observedFees).to.deep.equal(incrementalHookFees(
      pinnedState.buyCurve,
      [amountEach, amountEach],
      pinnedState.protocolDepthUsdc,
    ));
    return { receipts: [firstReceipt!, secondReceipt!], observedFees };
  }

  async function executeMultiActionBuy(signer: ethersUtils.Signer, amountEach: bigint) {
    const signerAddress = await signer.getAddress();
    const total = amountEach * 2n;
    await fundUsdc(signerAddress, total);
    const latest = await connection.ethers.provider.getBlock("latest");
    const deadline = BigInt(latest!.timestamp) + 3_600n;
    const poolKey = deriveV4PoolKey({
      token: deployment.token,
      base: deployment.base,
      hook: deployment.hook,
      fee: deployment.poolFee,
      tickSpacing: deployment.tickSpacing,
    });
    const call = buildV4ExactInputCall({
      poolKey,
      inputCurrency: deployment.base,
      legs: [
        { amountIn: amountEach, amountOutMinimum: 0n },
        { amountIn: amountEach, amountOutMinimum: 0n },
      ],
      aggregateAmountOutMinimum: 0n,
      deadline,
    });
    const usdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, signer);
    const permit2 = new ethersUtils.Contract(deployment.permit2, PERMIT2_ABI, signer);
    const router = new ethersUtils.Contract(deployment.universalRouter, UNIVERSAL_ROUTER_ABI, signer);
    await (await usdc.approve(deployment.permit2, total)).wait();
    await (await permit2.approve(deployment.base, deployment.universalRouter, total, deadline)).wait();
    const receipt = await (await router.execute(
      call.commands,
      call.inputs,
      call.deadline,
      { gasLimit: 5_000_000n },
    )).wait();
    expect(receipt!.status).to.equal(1);
    const parsed = parseV4SwapReceipt(receipt!.logs, {
      poolManager: deployment.poolManager,
      hook: deployment.hook,
    }, deployment.poolId);
    expect(parsed.swaps).to.have.length(2);
    expect(parsed.hookFees.map((fee) => fee.feeAmount)).to.deep.equal(incrementalHookFees(
      pinnedState.buyCurve,
      [amountEach, amountEach],
      pinnedState.protocolDepthUsdc,
    ));
    return { receipt: receipt!, parsed };
  }

  async function settleable(manager: ethersUtils.Contract, ids: readonly bigint[], side: bigint) {
    const values: bigint[] = [];
    for (const id of ids) {
      const order = await manager.getOrder(id);
      if (order.side === side && await manager.isSettleable(id)) values.push(id);
    }
    return values;
  }

  async function poolTokenBalances(account: string) {
    const nara = new ethersUtils.Contract(deployment.token, ERC20_ABI, connection.ethers.provider);
    const usdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, connection.ethers.provider);
    return {
      nara: await nara.balanceOf(account) as bigint,
      usdc: await usdc.balanceOf(account) as bigint,
    };
  }

  async function activeRangeInventory(manager: ethersUtils.Contract, ids: readonly bigint[]) {
    let nara = 0n;
    let usdc = 0n;
    let active = 0n;
    for (const id of ids) {
      const order = await manager.getOrder(id);
      if (order.status !== 1n) continue;
      const preview = await manager.previewSettlement(id);
      nara += preview.principalNara as bigint;
      usdc += preview.principalUsdc as bigint;
      active += 1n;
    }
    return { nara, usdc, active };
  }

  function slippageBps(inputUsdcRaw: bigint, actualNaraRaw: bigint): bigint {
    const idealNaraRaw = inputUsdcRaw * 10n ** 12n
      * pinnedState.humanUsdcPerNaraRational.denominator
      / pinnedState.humanUsdcPerNaraRational.numerator;
    if (actualNaraRaw >= idealNaraRaw) return 0n;
    return (idealNaraRaw - actualNaraRaw) * 10_000n / idealNaraRaw;
  }

  async function runProfileMatrix(profile: PlannedStrategyProfile): Promise<ExactForkCandidateMetrics> {
    rootSnapshot = await revertTo(rootSnapshot);
    const permanentBefore = await pinnedPermanentState();
    const deployed = await deployProfile(profile);
    let profileSnapshot = await snapshot();
    const rows: EvidenceRow[] = [];
    const repositoryHead = currentRepositoryHead();
    const candidateId = `${profile.name}-${profile.totalNaraInput / NARA_UNIT}-NARA`;
    const normalBuyExecution: Record<string, boolean> = {};
    let maximumObservedSlippageBps = 0n;
    let quoteFailures = 0n;
    const [attacker] = await connection.ethers.getSigners();
    const attackerAddress = await attacker.getAddress();
    const sensitivityBand = priceBand(pinnedState.humanUsdcPerNaraRational, 2_000n);
    for (const [movementBps, spot] of [
      ["-2000", sensitivityBand.minimum],
      ["+2000", sensitivityBand.maximum],
    ] as const) {
      rows.push({
        scenario: "SENSITIVITY",
        kind: "one_sided_price_band",
        movementBps,
        spotNumerator: spot.numerator.toString(),
        spotDenominator: spot.denominator.toString(),
        orders: profile.orders.map((order) => ({
          side: order.side,
          tickLower: order.tickLower.toString(),
          tickUpper: order.tickUpper.toString(),
          oneSidedAcrossFullBand: oneSidedAcrossHumanPriceBand(
            order,
            sensitivityBand.minimum,
            sensitivityBand.maximum,
          ),
        })),
      });
    }

    for (const size of REQUIRED_BUY_SIZES_USDC) {
      profileSnapshot = await revertTo(profileSnapshot);
      const amount = size * USDC_UNIT;
      await fundUsdc(attackerAddress, amount);
      const result = await executeExactForkSwap({
        provider: connection.ethers.provider,
        signer: attacker,
        deployment,
        amountIn: amount,
        inputCurrency: deployment.base,
      });
      normalBuyExecution[size.toString()] = result.status === "executed";
      if (result.status === "reverted") quoteFailures += 1n;
      const measuredSlippage = result.actualOutput === 0n ? 10_000n : slippageBps(amount, result.actualOutput);
      if (measuredSlippage > maximumObservedSlippageBps) maximumObservedSlippageBps = measuredSlippage;
      rows.push({
        scenario: "A", kind: "single_buy", sizeUsdc: size.toString(), status: result.status,
        transactionHash: result.transactionHash, transactionBlockNumber: result.blockNumber?.toString(),
        grossInputRaw: result.grossInput.toString(), outputRaw: result.actualOutput.toString(),
        hookVaultFeeRaw: result.hookFee.toString(), lpFeeRaw: result.lpFee.toString(),
        gasUsed: result.gasUsed.toString(), startTick: result.startTick.toString(), endTick: result.endTick.toString(),
      });
    }
    for (const size of [10n, 25n, 50n, 100n, 250n]) expect(normalBuyExecution[size.toString()]).to.equal(true);

    for (const size of REQUIRED_INDEPENDENT_SELL_SIZES_NARA) {
      profileSnapshot = await revertTo(profileSnapshot);
      const amount = size * NARA_UNIT;
      await fundForkAccountFromTreasury({
        provider: connection.ethers.provider,
        deployment,
        recipient: attackerAddress,
        token: deployment.token,
        amount,
      });
      const result = await executeExactForkSwap({
        provider: connection.ethers.provider,
        signer: attacker,
        deployment,
        amountIn: amount,
        inputCurrency: deployment.token,
      });
      if (result.status === "reverted") quoteFailures += 1n;
      rows.push({
        scenario: "A", kind: "independent_sell", sizeNara: size.toString(), status: result.status,
        transactionHash: result.transactionHash, transactionBlockNumber: result.blockNumber?.toString(),
        grossInputRaw: result.grossInput.toString(), outputRaw: result.actualOutput.toString(),
        hookVaultFeeRaw: result.hookFee.toString(), lpFeeRaw: result.lpFee.toString(),
        gasUsed: result.gasUsed.toString(), startTick: result.startTick.toString(), endTick: result.endTick.toString(),
      });
    }

    profileSnapshot = await revertTo(profileSnapshot);
    const pressureAmount = 10_000n * USDC_UNIT;
    const sameBlock = await executeSameBlockBuys(attacker, pressureAmount);
    rows.push({
      scenario: "B", kind: "same_block_transactions", sizeEachUsdc: "10000",
      transactionStatuses: sameBlock.receipts.map((receipt) => receipt.status === 1 ? "executed" : "reverted"),
      transactionHashes: sameBlock.receipts.map((receipt) => receipt.hash),
      transactionBlockNumbers: sameBlock.receipts.map((receipt) => receipt.blockNumber.toString()),
      hookFeesRaw: sameBlock.observedFees.map(String),
      gasUsed: sameBlock.receipts.map((receipt) => receipt.gasUsed.toString()),
    });

    profileSnapshot = await revertTo(profileSnapshot);
    const multiAction = await executeMultiActionBuy(attacker, pressureAmount);
    rows.push({
      scenario: "C", kind: "same_transaction_actions", sizeEachUsdc: "10000",
      status: multiAction.receipt.status === 1 ? "executed" : "reverted",
      transactionHash: multiAction.receipt.hash,
      transactionBlockNumber: multiAction.receipt.blockNumber.toString(),
      hookFeesRaw: multiAction.parsed.hookFees.map((fee) => fee.feeAmount.toString()),
      gasUsed: multiAction.receipt.gasUsed.toString(),
    });

    profileSnapshot = await revertTo(profileSnapshot);
    await fundUsdc(attackerAddress, pressureAmount * 2n);
    const splitFirst = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: pressureAmount, inputCurrency: deployment.base,
    });
    const splitSecond = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: pressureAmount, inputCurrency: deployment.base,
    });
    expect(splitFirst.status).to.equal("executed");
    expect(splitSecond.status).to.equal("executed");
    const resetFee = cumulativeHookFee(pinnedState.buyCurve, pressureAmount, pinnedState.protocolDepthUsdc);
    expect(splitFirst.hookFee).to.equal(resetFee);
    expect(splitSecond.hookFee).to.equal(resetFee);
    rows.push({
      scenario: "D", kind: "cross_block_pressure_reset",
      transactionStatuses: [splitFirst.status, splitSecond.status],
      transactionHashes: [splitFirst.transactionHash!, splitSecond.transactionHash!],
      transactionBlockNumbers: [splitFirst.blockNumber!.toString(), splitSecond.blockNumber!.toString()],
      hookFeesRaw: [splitFirst.hookFee.toString(), splitSecond.hookFee.toString()],
      blocks: [splitFirst.blockNumber!.toString(), splitSecond.blockNumber!.toString()],
    });

    profileSnapshot = await revertTo(profileSnapshot);
    const traversalInput = 20_000n * USDC_UNIT;
    const eSafeStart = await poolTokenBalances(deployment.safe);
    const eVaultStart = await poolTokenBalances(deployment.vault);
    await fundUsdc(attackerAddress, traversalInput);
    const eBuy = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: traversalInput, inputCurrency: deployment.base,
    });
    expect(eBuy.status).to.equal("executed");
    const eSettleable = await settleable(deployed.manager, deployed.ids, 0n);
    expect(eSettleable.length).to.be.greaterThan(0);
    const safeUsdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, connection.ethers.provider);
    const safeUsdcBefore = await safeUsdc.balanceOf(deployment.safe) as bigint;
    const ePrincipal = (await Promise.all(eSettleable.map(async (id) => {
      const preview = await deployed.manager.previewSettlement(id);
      return preview.principalUsdc as bigint;
    }))).reduce((sum, value) => sum + value, 0n);
    const eReceipt = await (await deployed.manager.settleMany(eSettleable)).wait();
    const safeUsdcAfter = await safeUsdc.balanceOf(deployment.safe) as bigint;
    const crystallizedUsdc = safeUsdcAfter - safeUsdcBefore;
    expect(crystallizedUsdc >= ePrincipal).to.equal(true);
    const attackerNara = new ethersUtils.Contract(deployment.token, ERC20_ABI, connection.ethers.provider);
    const acquiredE = await attackerNara.balanceOf(attackerAddress) as bigint;
    const eSell = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: acquiredE, inputCurrency: deployment.token,
    });
    expect(eSell.status).to.equal("executed");
    const nearMarketNaraSold = (await Promise.all(eSettleable.map(async (id) => {
      const order = await deployed.manager.getOrder(id);
      return order.inputAmount as bigint;
    }))).reduce((sum, value) => sum + value, 0n);
    const eSafeEnd = await poolTokenBalances(deployment.safe);
    const eVaultEnd = await poolTokenBalances(deployment.vault);
    rows.push({
      scenario: "E", kind: "buy_settle_sell", settledOrderIds: eSettleable.map(String),
      buyStatus: eBuy.status,
      settlementStatus: eReceipt!.status === 1 ? "executed" : "reverted",
      sellStatus: eSell.status,
      buyTransactionHash: eBuy.transactionHash!, buyBlockNumber: eBuy.blockNumber!.toString(),
      settlementTransactionHash: eReceipt!.hash, settlementBlockNumber: eReceipt!.blockNumber.toString(),
      sellTransactionHash: eSell.transactionHash!, sellBlockNumber: eSell.blockNumber!.toString(),
      rangePrincipalUsdcRaw: ePrincipal.toString(), rangeLpFeesUsdcRaw: (crystallizedUsdc - ePrincipal).toString(),
      nearMarketNaraSoldRaw: nearMarketNaraSold.toString(), permanentPolUnchanged: true,
      safeUsdcDeltaRaw: crystallizedUsdc.toString(), hookVaultUsdcFeeRaw: eBuy.vaultUsdcDelta.toString(),
      buyHookFeeRaw: eBuy.hookFee.toString(), buyLpFeeRaw: eBuy.lpFee.toString(),
      sellHookFeeRaw: eSell.hookFee.toString(), sellLpFeeRaw: eSell.lpFee.toString(),
      safeNaraDeltaRaw: (eSafeEnd.nara - eSafeStart.nara).toString(),
      fullSafeUsdcDeltaRaw: (eSafeEnd.usdc - eSafeStart.usdc).toString(),
      vaultNaraDeltaRaw: (eVaultEnd.nara - eVaultStart.nara).toString(),
      vaultUsdcDeltaRaw: (eVaultEnd.usdc - eVaultStart.usdc).toString(),
      unsettledInventory: await activeRangeInventory(deployed.manager, deployed.ids),
      buyGasUsed: eBuy.gasUsed.toString(), settleGasUsed: eReceipt!.gasUsed.toString(), sellGasUsed: eSell.gasUsed.toString(),
    });

    profileSnapshot = await revertTo(profileSnapshot);
    const gSafeStart = await poolTokenBalances(deployment.safe);
    const gVaultStart = await poolTokenBalances(deployment.vault);
    await fundUsdc(attackerAddress, traversalInput);
    const previewAtomicBuy = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: traversalInput, inputCurrency: deployment.base,
    });
    expect(previewAtomicBuy.status).to.equal("executed");
    const atomicReverseInput = previewAtomicBuy.actualOutput;
    profileSnapshot = await revertTo(profileSnapshot);
    const atomicHarness = await connection.ethers.deployContract("MockTreasuryRangeAtomicTrader", [
      deployment.universalRouter, deployment.permit2, deployment.token, deployment.base,
    ], attacker);
    await atomicHarness.waitForDeployment();
    const atomicAddress = await atomicHarness.getAddress();
    await fundUsdc(attackerAddress, traversalInput);
    const attackerUsdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, attacker);
    await (await attackerUsdc.approve(atomicAddress, traversalInput)).wait();
    await (await atomicHarness.getFunction("fund")(0n, traversalInput)).wait();
    const latestAtomic = await connection.ethers.provider.getBlock("latest");
    const atomicDeadline = BigInt(latestAtomic!.timestamp) + 3_600n;
    const poolKey = deriveV4PoolKey({
      token: deployment.token, base: deployment.base, hook: deployment.hook,
      fee: deployment.poolFee, tickSpacing: deployment.tickSpacing,
    });
    const atomicBuyCall = buildV4ExactInputCall({
      poolKey, inputCurrency: deployment.base,
      legs: [{ amountIn: traversalInput, amountOutMinimum: 0n }],
      aggregateAmountOutMinimum: 0n, deadline: atomicDeadline,
    });
    const atomicSellCall = buildV4ExactInputCall({
      poolKey, inputCurrency: deployment.token,
      legs: [{ amountIn: atomicReverseInput, amountOutMinimum: 0n }],
      aggregateAmountOutMinimum: 0n, deadline: atomicDeadline,
    });
    const atomicReceipt = await (await atomicHarness.getFunction("executeAtomic")(
      [
        [atomicBuyCall.commands, atomicBuyCall.inputs, atomicBuyCall.deadline],
        [atomicSellCall.commands, atomicSellCall.inputs, atomicSellCall.deadline],
      ],
      atomicReverseInput, traversalInput, atomicDeadline, { gasLimit: 8_000_000n },
    )).wait();
    expect(await atomicHarness.getFunction("assertAllowanceClean")()).to.equal(true);
    const atomicParsed = parseV4SwapReceipt(atomicReceipt!.logs, {
      poolManager: deployment.poolManager, hook: deployment.hook,
    }, deployment.poolId);
    expect(atomicParsed.swaps).to.have.length(2);
    const firstAtomicSqrtPrice = atomicParsed.swaps[0].sqrtPriceX96;
    expect(profile.orders.some((order) => order.side === "SELL_NARA"
      && firstAtomicSqrtPrice <= getSqrtPriceAtTick(order.tickLower))).to.equal(true);
    rows.push({
      scenario: "F", kind: "atomic_buy_reverse_no_settlement_window",
      status: atomicReceipt!.status === 1 ? "executed" : "reverted",
      transactionHash: atomicReceipt!.hash, transactionBlockNumber: atomicReceipt!.blockNumber.toString(),
      swapCount: atomicParsed.swaps.length,
      gasUsed: atomicReceipt!.gasUsed.toString(), limitationObserved: true,
    });

    profileSnapshot = await revertTo(profileSnapshot);
    await fundUsdc(attackerAddress, traversalInput);
    const gBuy = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: traversalInput, inputCurrency: deployment.base,
    });
    expect(gBuy.status).to.equal("executed");
    const acquiredG = await attackerNara.balanceOf(attackerAddress) as bigint;
    const gSell = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: acquiredG, inputCurrency: deployment.token,
    });
    expect(gSell.status).to.equal("executed");
    const unsettledLoss = traversalInput - gSell.actualOutput;
    const gSafeEnd = await poolTokenBalances(deployment.safe);
    const gVaultEnd = await poolTokenBalances(deployment.vault);
    rows.push({
      scenario: "G", kind: "buy_reverse_without_settlement",
      buyStatus: gBuy.status, sellStatus: gSell.status,
      buyTransactionHash: gBuy.transactionHash!, buyBlockNumber: gBuy.blockNumber!.toString(),
      sellTransactionHash: gSell.transactionHash!, sellBlockNumber: gSell.blockNumber!.toString(),
      roundTripLossUsdcRaw: unsettledLoss.toString(),
      unsettledOrderCount: (await settleable(deployed.manager, deployed.ids, 0n)).length,
      buyHookFeeRaw: gBuy.hookFee.toString(), buyLpFeeRaw: gBuy.lpFee.toString(),
      sellHookFeeRaw: gSell.hookFee.toString(), sellLpFeeRaw: gSell.lpFee.toString(),
      safeNaraDeltaRaw: (gSafeEnd.nara - gSafeStart.nara).toString(),
      safeUsdcDeltaRaw: (gSafeEnd.usdc - gSafeStart.usdc).toString(),
      vaultNaraDeltaRaw: (gVaultEnd.nara - gVaultStart.nara).toString(),
      vaultUsdcDeltaRaw: (gVaultEnd.usdc - gVaultStart.usdc).toString(),
      unsettledInventory: await activeRangeInventory(deployed.manager, deployed.ids),
    });

    profileSnapshot = await revertTo(profileSnapshot);
    const hSafeStart = await poolTokenBalances(deployment.safe);
    const hVaultStart = await poolTokenBalances(deployment.vault);
    await fundUsdc(attackerAddress, traversalInput);
    const hBuy = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: traversalInput, inputCurrency: deployment.base,
    });
    expect(hBuy.status).to.equal("executed");
    const hIds = await settleable(deployed.manager, deployed.ids, 0n);
    expect(hIds.length).to.be.greaterThan(0);
    const hSettlementReceipt = await (await deployed.manager.settleMany(hIds)).wait();
    const acquiredH = await attackerNara.balanceOf(attackerAddress) as bigint;
    const hSell = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: acquiredH, inputCurrency: deployment.token,
    });
    expect(hSell.status).to.equal("executed");
    const settledLoss = traversalInput - hSell.actualOutput;
    expect(settledLoss > unsettledLoss).to.equal(true);
    const hSafeEnd = await poolTokenBalances(deployment.safe);
    const hVaultEnd = await poolTokenBalances(deployment.vault);
    rows.push({
      scenario: "H", kind: "buy_settle_reverse", settledOrderIds: hIds.map(String),
      buyStatus: hBuy.status,
      settlementStatus: hSettlementReceipt!.status === 1 ? "executed" : "reverted",
      sellStatus: hSell.status,
      buyTransactionHash: hBuy.transactionHash!, buyBlockNumber: hBuy.blockNumber!.toString(),
      settlementTransactionHash: hSettlementReceipt!.hash,
      settlementBlockNumber: hSettlementReceipt!.blockNumber.toString(),
      sellTransactionHash: hSell.transactionHash!, sellBlockNumber: hSell.blockNumber!.toString(),
      roundTripLossUsdcRaw: settledLoss.toString(), permanentPolUnchanged: true,
      buyHookFeeRaw: hBuy.hookFee.toString(), buyLpFeeRaw: hBuy.lpFee.toString(),
      sellHookFeeRaw: hSell.hookFee.toString(), sellLpFeeRaw: hSell.lpFee.toString(),
      safeNaraDeltaRaw: (hSafeEnd.nara - hSafeStart.nara).toString(),
      safeUsdcDeltaRaw: (hSafeEnd.usdc - hSafeStart.usdc).toString(),
      vaultNaraDeltaRaw: (hVaultEnd.nara - hVaultStart.nara).toString(),
      vaultUsdcDeltaRaw: (hVaultEnd.usdc - hVaultStart.usdc).toString(),
      unsettledInventory: await activeRangeInventory(deployed.manager, deployed.ids),
    });

    for (const fraction of REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS) {
      profileSnapshot = await revertTo(profileSnapshot);
      await fundUsdc(attackerAddress, traversalInput);
      const buy = await executeExactForkSwap({
        provider: connection.ethers.provider, signer: attacker, deployment,
        amountIn: traversalInput, inputCurrency: deployment.base,
      });
      expect(buy.status).to.equal("executed");
      const acquired = await attackerNara.balanceOf(attackerAddress) as bigint;
      const sellInput = acquired * fraction / 10_000n;
      const sell = await executeExactForkSwap({
        provider: connection.ethers.provider, signer: attacker, deployment,
        amountIn: sellInput, inputCurrency: deployment.token,
      });
      expect(sell.status).to.equal("executed");
      rows.push({
        scenario: "G", kind: "acquired_inventory_sell_fraction", fractionBps: fraction.toString(),
        buyStatus: buy.status, sellStatus: sell.status,
        buyTransactionHash: buy.transactionHash!, buyBlockNumber: buy.blockNumber!.toString(),
        sellTransactionHash: sell.transactionHash!, sellBlockNumber: sell.blockNumber!.toString(),
        acquiredNaraRaw: acquired.toString(), soldNaraRaw: sellInput.toString(), usdcOutputRaw: sell.actualOutput.toString(),
      });
    }

    profileSnapshot = await revertTo(profileSnapshot);
    await fundForkAccountFromTreasury({
      provider: connection.ethers.provider,
      deployment,
      recipient: attackerAddress,
      token: deployment.token,
      amount: 50_000n * NARA_UNIT,
    });
    const bidTraversal = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: 50_000n * NARA_UNIT, inputCurrency: deployment.token,
    });
    expect(bidTraversal.status).to.equal("executed");
    const bidIds = await settleable(deployed.manager, deployed.ids, 1n);
    expect(bidIds.length, `${candidateId} must cross at least one BUY_NARA range`).to.be.greaterThan(0);
    let treasuryNaraAccumulated = 0n;
    let bidSettlementReceipt: ethersUtils.TransactionReceipt | null = null;
    if (bidIds.length > 0) {
      const safeNara = new ethersUtils.Contract(deployment.token, ERC20_ABI, connection.ethers.provider);
      const before = await safeNara.balanceOf(deployment.safe) as bigint;
      bidSettlementReceipt = await (await deployed.manager.settleMany(bidIds)).wait();
      treasuryNaraAccumulated = (await safeNara.balanceOf(deployment.safe) as bigint) - before;
    }
    expect(bidSettlementReceipt?.status, `${candidateId} bid settlement must execute`).to.equal(1);
    expect(treasuryNaraAccumulated > 0n, `${candidateId} bid settlement must return NARA`).to.equal(true);
    rows.push({
      scenario: "H", kind: "bid_settlement_after_independent_sell",
      sellStatus: bidTraversal.status,
      settlementStatus: bidSettlementReceipt === null
        ? "not_applicable"
        : bidSettlementReceipt.status === 1 ? "executed" : "reverted",
      sellTransactionHash: bidTraversal.transactionHash!, sellBlockNumber: bidTraversal.blockNumber!.toString(),
      ...(bidSettlementReceipt === null ? {} : {
        settlementTransactionHash: bidSettlementReceipt.hash,
        settlementBlockNumber: bidSettlementReceipt.blockNumber.toString(),
      }),
      settledOrderIds: bidIds.map(String), treasuryNaraAccumulatedRaw: treasuryNaraAccumulated.toString(),
    });

    await assertPermanentStateUnchanged(permanentBefore);
    const requiredScenarios = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const scenarioCoverage = requiredScenarios.filter((scenario) => rows.some((row) => row.scenario === scenario));
    const buySizeCoverageUsdc = rows
      .filter((row) => row.kind === "single_buy")
      .map((row) => String(row.sizeUsdc));
    const independentSellSizeCoverageNara = rows
      .filter((row) => row.kind === "independent_sell")
      .map((row) => String(row.sizeNara));
    const acquiredSellFractionCoverageBps = rows
      .filter((row) => row.kind === "acquired_inventory_sell_fraction")
      .map((row) => String(row.fractionBps));
    const exactForkValidated = scenarioCoverage.length === requiredScenarios.length
      && buySizeCoverageUsdc.length === REQUIRED_BUY_SIZES_USDC.length
      && independentSellSizeCoverageNara.length === REQUIRED_INDEPENDENT_SELL_SIZES_NARA.length
      && acquiredSellFractionCoverageBps.length === REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS.length;
    const boundMatrix = bindTreasuryRangeMatrixRows({
      candidateId,
      repositoryHead,
      chainId: pinnedState.chainId,
      blockNumber: pinnedState.blockNumber,
      blockHash: pinnedState.blockHash,
      currentSqrtPriceX96: pinnedState.sqrtPriceX96,
      currentTick: pinnedState.tick,
      hookConfigurationHash: profile.hookConfigurationHash,
      humanUsdcPerNara: pinnedState.humanUsdcPerNaraRational,
    }, rows);
    return {
      candidateId,
      exactForkValidated,
      exactInputOnly: true,
      scenarioCoverage,
      buySizeCoverageUsdc,
      independentSellSizeCoverageNara,
      acquiredSellFractionCoverageBps,
      matrixHash: boundMatrix.matrixHash,
      matrix: boundMatrix.rows,
      normalBuyExecution,
      crystallizedUsdc,
      treasuryNaraAccumulated,
      nearMarketNaraSold,
      nextTransactionRoundTripLossUsdc: settledLoss,
      maximumObservedSlippageBps,
      quoteFailures,
    };
  }

  it("pins exact custody/runtime state and executes the $10 canary without changing permanent POL", async function () {
    expect(pinnedState.positionReconciliation.exact).to.equal(true);
    if (requiresHistoricalPinnedUsdcAdversaryBalance(pinnedState.blockNumber)) {
      expect(pinnedState.safeBalances).to.deep.equal({ nara: 2_070_480n, usdc: 0n });
    }
    expect(await connection.ethers.provider.getCode(PINNED_USDC_ADVERSARY.address)).to.equal("0x");
    const usdc = new ethersUtils.Contract(deployment.base, ERC20_ABI, connection.ethers.provider);
    const adversaryBalance = await usdc.balanceOf(PINNED_USDC_ADVERSARY.address) as bigint;
    if (requiresHistoricalPinnedUsdcAdversaryBalance(pinnedState.blockNumber)) {
      expect(adversaryBalance).to.equal(PINNED_USDC_ADVERSARY.balanceRaw);
    } else {
      expect(adversaryBalance >= 10n * USDC_UNIT).to.equal(true);
    }
    const before = await pinnedPermanentState();
    const [attacker] = await connection.ethers.getSigners();
    const address = await attacker.getAddress();
    await fundUsdc(address, 10n * USDC_UNIT);
    const result = await executeExactForkSwap({
      provider: connection.ethers.provider, signer: attacker, deployment,
      amountIn: 10n * USDC_UNIT, inputCurrency: deployment.base,
    });
    expect(result.status).to.equal("executed");
    expect(result.vaultUsdcDelta).to.equal(result.hookFee);
    expect(result.lpFee > 0n).to.equal(true);
    await assertPermanentStateUnchanged(before);
  });

  it("parses every finalized profile with the canonical ops schema and shared whole-manifest hash", function () {
    expect(scenarioPlan.manifests).to.have.length(3);
    scenarioPlan.manifests.forEach((manifest, index) => {
      const parsed = parseTreasuryRangeStrategyManifest(manifest);
      expect(parsed.schemaVersion).to.equal(TREASURY_RANGE_STRATEGY_SCHEMA);
      expect(parsed.strategyHash).to.equal(scenarioPlan.profiles[index].strategyHash);
      expect(scenarioPlan.profiles[index].orders.every(
        (order) => order.strategyHash === parsed.strategyHash,
      )).to.equal(true);
    });
  });

  it("executes A-H and every required size on all 21 candidates, then selects only from exact evidence", async function () {
    const metrics = new Map<string, ExactForkCandidateMetrics>();
    const candidates = scenarioPlan.profiles.flatMap((baseProfile) => REQUIRED_NARA_BUDGETS.map((budget) =>
      finalizeTreasuryRangeProfile({
        state: pinnedState,
        profile: rescaleStrategyProfile(baseProfile, budget * NARA_UNIT),
        hookConfiguration: scenarioPlan.hookConfiguration,
        hookConfigurationHash: scenarioPlan.hookConfigurationHash,
        repositoryHead: currentRepositoryHead(),
      }).profile));
    expect(candidates).to.have.length(21);
    for (const profile of candidates) {
      const result = await runProfileMatrix(profile);
      expect(result.scenarioCoverage).to.deep.equal(["A", "B", "C", "D", "E", "F", "G", "H"]);
      expect(result.buySizeCoverageUsdc).to.deep.equal(REQUIRED_BUY_SIZES_USDC.map(String));
      expect(result.independentSellSizeCoverageNara).to.deep.equal(REQUIRED_INDEPENDENT_SELL_SIZES_NARA.map(String));
      expect(result.acquiredSellFractionCoverageBps).to.deep.equal(REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS.map(String));
      metrics.set(result.candidateId, result);
    }
    expect(metrics).to.have.length(21);
    const optimized = optimizeTreasuryRanges({
      baseProfiles: scenarioPlan.profiles,
      metrics,
      evidenceBinding: {
        repositoryHead: currentRepositoryHead(),
        chainId: pinnedState.chainId,
        blockNumber: pinnedState.blockNumber,
        blockHash: pinnedState.blockHash,
        currentSqrtPriceX96: pinnedState.sqrtPriceX96,
        currentTick: pinnedState.tick,
        hookConfigurationHash: scenarioPlan.hookConfigurationHash,
        humanUsdcPerNara: pinnedState.humanUsdcPerNaraRational,
      },
      safeBalances: pinnedState.safeBalances,
      treasuryBalances: pinnedState.treasuryBalances,
      finalizeProfile: (profile, evidence) => finalizeTreasuryRangeProfile({
        state: pinnedState,
        profile,
        hookConfiguration: scenarioPlan.hookConfiguration,
        hookConfigurationHash: scenarioPlan.hookConfigurationHash,
        repositoryHead: currentRepositoryHead(),
        simulationEvidence: evidence,
      }),
    });
    expect(optimized.selectedCandidateId).not.to.equal(null);
    expect(optimized.pareto.length).to.be.greaterThan(0);
    expect(optimized.pareto.every((candidate) => candidate.hardGatePass)).to.equal(true);
    const selected = optimized.candidates.find(
      (candidate) => candidate.candidateId === optimized.selectedCandidateId,
    );
    if (!selected) throw new Error("Selected optimizer candidate is missing from exact evidence");
    expect(optimized.selectedCandidateId).to.equal("CONSERVATIVE-100000-NARA");
    const expectedSelectionStatus = pinnedState.safeBalances.usdc < TREASURY_RANGE_NOMINAL_USDC_BUDGET
      || pinnedState.safeBalances.nara < selected.naraBudget
      ? "SELECTED_EXECUTION_BLOCKED"
      : "SELECTED_BUILDABLE";
    expect(optimized.selectionStatus).to.equal(expectedSelectionStatus);
    const parsedSelected = parseTreasuryRangeStrategyManifest(selected.manifest);
    expect(() => assertTreasuryRangeManifestExactEvidence(parsedSelected)).not.to.throw();
    expect(() => assertTreasuryRangeCanaryLaunchManifest(parsedSelected)).not.to.throw();
    expect(() => assertTreasuryRangeCanarySafeFunding(parsedSelected, {
      nara: 100_000n * NARA_UNIT - 1n,
      usdc: TREASURY_RANGE_NOMINAL_USDC_BUDGET,
    })).to.throw(/Safe NARA balance is below/);
    expect(() => assertTreasuryRangeCanarySafeFunding(parsedSelected, {
      nara: 100_000n * NARA_UNIT,
      usdc: TREASURY_RANGE_NOMINAL_USDC_BUDGET - 1n,
    })).to.throw(/Safe USDC balance is below/);
    expect(() => assertTreasuryRangeCanarySafeFunding(parsedSelected, {
      nara: 100_000n * NARA_UNIT,
      usdc: TREASURY_RANGE_NOMINAL_USDC_BUDGET,
    })).not.to.throw();
    expect(() => assertTreasuryRangeCanaryLaunchManifest({
      ...parsedSelected,
      budget: {
        ...parsedSelected.budget,
        exposedUsdcRaw: (201n * USDC_UNIT).toString(),
        protectedUsdcReserveRaw: (299n * USDC_UNIT).toString(),
      },
    })).to.throw(/approved 100,000 NARA/);
    expect(() => assertTreasuryRangeCanaryLaunchManifest({
      ...parsedSelected,
      proposedOrders: parsedSelected.proposedOrders.map((order, index) => index === 8
        ? { ...order, inputAmountRaw: (BigInt(order.inputAmountRaw) + 1n).toString() }
        : order),
    })).to.throw(/not the canonical canary order/);
    expect(() => assertTreasuryRangeCanaryLaunchManifest({
      ...parsedSelected,
      proposedOrders: [...parsedSelected.proposedOrders, {
        ...parsedSelected.proposedOrders[0],
        enabled: false,
      }],
    })).to.throw(/order set is not canonical/);
    expect(() => assertTreasuryRangeCanaryLaunchManifest({
      ...parsedSelected,
      proposedOrders: parsedSelected.proposedOrders.map((order, index) => index === 0
        ? { ...order, orderId: "1" }
        : order),
    })).to.throw(/order set is not canonical/);
    expect(() => assertTreasuryRangeCanaryLaunchManifest({
      ...parsedSelected,
      proposedOrders: parsedSelected.proposedOrders.map((order, index) => index === 0
        ? { ...order, humanPriceLower: "0.000000000000000001" }
        : order),
    })).to.throw(/not the canonical canary order/);
    expect(() => assertTreasuryRangeCanaryLaunchManifest({
      ...parsedSelected,
      changeId: parsedSelected.changeId.replace(TREASURY_RANGE_CANARY_CHANGE_ID_PREFIX, "NARA-20260828-v4-treasury-ranges"),
    })).to.throw(/approved CONSERVATIVE-100000-NARA/);
    expect(() => assertTreasuryRangeManifestExactEvidence({
      ...parsedSelected,
      simulationMatrix: [],
    })).to.throw(/exactly 30 rows/);
    expect(() => parseTreasuryRangeStrategyManifest({
      ...parsedSelected,
      budget: {
        ...parsedSelected.budget,
        totalUsdcBudgetRaw: (501n * USDC_UNIT).toString(),
        protectedUsdcReserveRaw: (301n * USDC_UNIT).toString(),
      },
    })).to.throw(/exact 500 USDC canary budget/);
    expect(() => parseTreasuryRangeStrategyManifest({
      ...parsedSelected,
      budget: {
        ...parsedSelected.budget,
        totalUsdcBudgetRaw: (5_000n * USDC_UNIT).toString(),
        protectedUsdcReserveRaw: (5_000n * USDC_UNIT - BigInt(parsedSelected.budget.exposedUsdcRaw)).toString(),
      },
    })).to.throw(/exact 500 USDC canary budget/);
    const wrongProfile = parsedSelected.changeId.includes("-conservative-") ? "aggressive" : "conservative";
    expect(() => assertTreasuryRangeManifestExactEvidence({
      ...parsedSelected,
      changeId: parsedSelected.changeId.replace(/-(?:conservative|aggressive|adversarial)-/, `-${wrongProfile}-`),
    })).to.throw(/candidate profile does not match/);
    const outputPath = process.env.V4_TREASURY_MATRIX_OUTPUT?.trim();
    const strategyOutputPath = process.env.V4_TREASURY_STRATEGY_OUTPUT?.trim();
    if (outputPath || strategyOutputPath) {
      if (outputPath) {
        writeFileSync(resolve(outputPath), `${canonicalJson({
          schemaVersion: "nara.v4.treasury-range-matrix-evidence.v1",
          repositoryHead: currentRepositoryHead(),
          pinnedState: {
            chainId: pinnedState.chainId.toString(),
            blockNumber: pinnedState.blockNumber.toString(),
            blockHash: pinnedState.blockHash,
            timestamp: pinnedState.timestamp.toString(),
          },
          metrics: [...metrics.values()],
          optimizerResult: optimized,
          selectedFinalizedManifest: selected.manifest,
          noBroadcast: true,
        })}\n`, { encoding: "utf8", flag: "w" });
      }
      if (strategyOutputPath) {
        writeFileSync(resolve(strategyOutputPath), `${canonicalJson(selected.manifest)}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
      }
    }
  });
});
