/** Build an unsigned, atomic Safe order-creation packet. This file never signs or broadcasts. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { canonicalProductionV4Deployment } from "./lib/v4LiveConfig.js";
import {
  assertTreasuryRangeCanarySafeFunding,
  assertTreasuryRangeManifestExactEvidence,
  loadTreasuryRangeStrategyManifest,
} from "./lib/v4TreasuryRangeManifest.js";
import {
  ERC20_APPROVAL_ABI,
  TREASURY_RANGE_MANAGER_ABI,
  assertTreasuryRangeViewChecks,
  assertTreasuryRangeUsdcDependency,
  buildAndWriteTreasuryRangePacket,
  jitDeadline,
  readTreasuryRangeBuildContext,
  readTreasuryRangeManagerSafetyState,
  readVerifiedTreasuryRangeManagerDeployment,
  recomputeAndAssertTreasuryRangeOrder,
  safeTreasuryRangeError,
} from "./lib/v4TreasuryRangeSafeBuilder.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STRATEGY = resolve(REPOSITORY_ROOT, "deployments", "v4-treasury-range-strategy-candidate.json");
const OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "deployments");
const UINT128_MAX = (1n << 128n) - 1n;

function requiredManagerAddress(): string {
  const value = process.env.RANGE_MANAGER_ADDRESS?.trim();
  if (!value) throw new Error("RANGE_MANAGER_ADDRESS is required");
  return ethers.getAddress(value);
}

async function assertManagerBindings(
  manager: ethers.Contract,
  expected: ReturnType<typeof canonicalProductionV4Deployment>,
  blockTag: number,
): Promise<void> {
  const checks: ReadonlyArray<[string, string | number | bigint]> = [
    ["NARA", expected.token], ["USDC", expected.base], ["TREASURY_SAFE", expected.safe],
    ["LIQUIDITY_VAULT", expected.vault], ["POOL_MANAGER", expected.poolManager],
    ["POSITION_MANAGER", expected.positionManager], ["PERMIT2", expected.permit2], ["HOOK", expected.hook],
    ["POOL_FEE", expected.poolFee], ["TICK_SPACING", expected.tickSpacing], ["POOL_ID", expected.poolId],
  ];
  for (const [method, expectedValue] of checks) {
    const actual = await manager.getFunction(method)({ blockTag });
    const matches = typeof expectedValue === "string" && ethers.isAddress(String(expectedValue))
      ? ethers.getAddress(actual) === ethers.getAddress(expectedValue)
      : typeof expectedValue === "string"
        ? String(actual).toLowerCase() === String(expectedValue).toLowerCase()
        : BigInt(actual) === BigInt(expectedValue);
    if (!matches) throw new Error(`Range Manager ${method} binding mismatch`);
  }
}

async function main(): Promise<void> {
  const strategyPath = resolve(process.env.V4_TREASURY_RANGE_STRATEGY_MANIFEST?.trim() || DEFAULT_STRATEGY);
  const strategy = loadTreasuryRangeStrategyManifest(strategyPath);
  assertTreasuryRangeManifestExactEvidence(strategy);
  let context = await readTreasuryRangeBuildContext(REPOSITORY_ROOT, strategyPath, strategy);
  const production = canonicalProductionV4Deployment();
  const managerAddress = requiredManagerAddress();
  const usdcDependency = await assertTreasuryRangeUsdcDependency(context, { rangeManager: managerAddress });
  context = { ...context, usdcDependency };
  const deploymentEvidence = await readVerifiedTreasuryRangeManagerDeployment(REPOSITORY_ROOT, context, managerAddress);
  const expectedRuntimeHash = deploymentEvidence.runtimeCodeHash;
  await assertTreasuryRangeViewChecks(context, strategy.hookConfiguration.readChecks, "hookConfiguration.readChecks");
  const manager = new ethers.Contract(managerAddress, TREASURY_RANGE_MANAGER_ABI, context.provider);
  await assertManagerBindings(manager, production, context.block.number);
  const managerSafetyState = await readTreasuryRangeManagerSafetyState(context, managerAddress);
  if (BigInt(await manager.MAX_SETTLE_BATCH({ blockTag: context.block.number })) !== 16n) throw new Error("Range Manager batch cap differs from 16");
  const deadline = BigInt(jitDeadline(context.block.timestamp));
  const orders = strategy.proposedOrders.filter((order) => order.enabled);
  if (orders.length === 0 || orders.length > 16) throw new Error("Order batch must contain between 1 and 16 enabled orders");
  const poolState = await manager.currentPoolState({ blockTag: context.block.number });
  const currentSqrtPriceX96 = BigInt(poolState[0]);
  const currentTick = Number(poolState[1]);
  const economicRecomputations = orders.map((order, index) => recomputeAndAssertTreasuryRangeOrder(
    order,
    strategy.strategyHash,
    deadline,
    BigInt(strategy.poolKey.tickSpacing),
    currentSqrtPriceX96,
    `proposedOrders[${index}]`,
  ));
  const naraInput = orders.filter((order) => order.side === "SELL_NARA").reduce((sum, order) => sum + BigInt(order.inputAmountRaw), 0n);
  const usdcInput = orders.filter((order) => order.side === "BUY_NARA").reduce((sum, order) => sum + BigInt(order.inputAmountRaw), 0n);
  const nara = new ethers.Contract(production.token, ERC20_APPROVAL_ABI, context.provider);
  const usdc = new ethers.Contract(production.base, ERC20_APPROVAL_ABI, context.provider);
  const [naraBalance, usdcBalance, naraAllowance, usdcAllowance] = await Promise.all([
    nara.balanceOf(production.safe, { blockTag: context.block.number }) as Promise<bigint>,
    usdc.balanceOf(production.safe, { blockTag: context.block.number }) as Promise<bigint>,
    nara.allowance(production.safe, managerAddress, { blockTag: context.block.number }) as Promise<bigint>,
    usdc.allowance(production.safe, managerAddress, { blockTag: context.block.number }) as Promise<bigint>,
  ]);
  if (BigInt(naraAllowance) !== 0n || BigInt(usdcAllowance) !== 0n) throw new Error("Safe already has a non-zero token allowance to the manager");
  assertTreasuryRangeCanarySafeFunding(strategy, { nara: BigInt(naraBalance), usdc: BigInt(usdcBalance) });
  if (BigInt(naraBalance) < naraInput || BigInt(usdcBalance) < usdcInput) throw new Error("Safe balance is below the exact proposed input");
  const calls: Array<{ to: string; value: string; data: string }> = [];
  if (naraInput > 0n) calls.push({ to: production.token, value: "0", data: nara.interface.encodeFunctionData("approve", [managerAddress, naraInput]) });
  if (usdcInput > 0n) calls.push({ to: production.base, value: "0", data: usdc.interface.encodeFunctionData("approve", [managerAddress, usdcInput]) });
  for (const order of orders) {
    const input = BigInt(order.inputAmountRaw);
    const minimum = BigInt(order.minimumOutputAmountRaw);
    if (input > UINT128_MAX || minimum > UINT128_MAX) throw new Error("Order input/minimum exceeds uint128");
    const method = order.side === "SELL_NARA" ? "createSellNaraOrder" : "createBuyNaraOrder";
    calls.push({
      to: managerAddress,
      value: "0",
      data: manager.interface.encodeFunctionData(method, [order.tickLower, order.tickUpper, input, minimum, strategy.strategyHash, deadline]),
    });
  }
  if (naraInput > 0n) calls.push({ to: production.token, value: "0", data: nara.interface.encodeFunctionData("approve", [managerAddress, 0]) });
  if (usdcInput > 0n) calls.push({ to: production.base, value: "0", data: usdc.interface.encodeFunctionData("approve", [managerAddress, 0]) });
  calls.push({ to: managerAddress, value: "0", data: manager.interface.encodeFunctionData("assertOperationalClean") });
  const result = await buildAndWriteTreasuryRangePacket({
    repositoryRoot: REPOSITORY_ROOT,
    outputDirectory: OUTPUT_DIRECTORY,
    slug: "orders",
    purpose: "NARA v4 Treasury Range order creation",
    context,
    calls,
    details: {
      strategyPath,
      managerAddress,
      managerRuntimeCodeHash: expectedRuntimeHash,
      managerDeployment: deploymentEvidence,
      managerSafetyState,
      jitPoolState: { sqrtPriceX96: currentSqrtPriceX96.toString(), tick: currentTick },
      economicRecomputations,
      deadline: deadline.toString(),
      exactNaraApprovalRaw: naraInput.toString(),
      exactUsdcApprovalRaw: usdcInput.toString(),
      protectedUsdcReserveRaw: strategy.budget.protectedUsdcReserveRaw,
      orders,
      finalAssertion: "assertOperationalClean()",
    },
    checks: [
      "Verify every human price range, aligned tick, exact raw input, deterministic output, and non-zero minimum.",
      "Verify every range is still strictly one-sided at the recorded current pool state.",
      "Verify current and pending Hook curve/depth evidence; stop if any pending change is ignored.",
      "Verify exact approvals, zero resets, protected USDC reserve, and final assertOperationalClean call.",
      "Recheck Safe nonce and deadline immediately before signing; never reuse this packet.",
    ],
    validUntil: Number(deadline),
  });
  process.stdout.write(`Unsigned order packet: ${result.jsonPath}\nReview: ${result.markdownPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${safeTreasuryRangeError(error)}\n`);
  process.exitCode = 1;
});
