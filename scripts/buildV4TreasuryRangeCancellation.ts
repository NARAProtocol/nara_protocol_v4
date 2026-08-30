/** Build an unsigned, atomic Safe cancellation packet. This file never signs or broadcasts. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { canonicalProductionV4Deployment } from "./lib/v4LiveConfig.js";
import { loadTreasuryRangeStrategyManifest } from "./lib/v4TreasuryRangeManifest.js";
import {
  TREASURY_RANGE_MANAGER_ABI,
  assertTreasuryRangeViewChecks,
  buildAndWriteTreasuryRangePacket,
  jitDeadline,
  readTreasuryRangeBuildContext,
  readTreasuryRangeManagerSafetyState,
  readVerifiedTreasuryRangeManagerDeployment,
  safeTreasuryRangeError,
} from "./lib/v4TreasuryRangeSafeBuilder.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STRATEGY = resolve(REPOSITORY_ROOT, "deployments", "v4-treasury-range-strategy-candidate.json");
const OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "deployments");
const UINT128_MAX = (1n << 128n) - 1n;

interface Cancellation {
  orderId: bigint;
  minNaraOut: bigint;
  minUsdcOut: bigint;
  expectedStrategyHash: string;
}

function parseArguments(argv: readonly string[]): { cancellations: Cancellation[]; reason: string } {
  const records = argv.filter((item) => item.startsWith("--order=")).map((item) => item.slice("--order=".length));
  const reasonArgument = argv.find((item) => item.startsWith("--reason="));
  if (!reasonArgument || reasonArgument.slice("--reason=".length).trim().length < 8) {
    throw new Error("A specific --reason=<at least 8 characters> is required for human review");
  }
  if (records.length === 0 || records.length > 16) throw new Error("Provide between 1 and 16 --order=id:minNaraOut:minUsdcOut:strategyHash arguments");
  const cancellations = records.map((record) => {
    const fields = record.split(":");
    if (fields.length !== 4 || fields.slice(0, 3).some((field) => !/^\d+$/.test(field)) || !ethers.isHexString(fields[3], 32)) {
      throw new Error("Each --order must be id:minNaraOut:minUsdcOut:strategyHash using raw unsigned integers and bytes32");
    }
    const [orderId, minNaraOut, minUsdcOut] = fields.slice(0, 3).map(BigInt);
    if (orderId === 0n || (minNaraOut === 0n && minUsdcOut === 0n)) throw new Error("Cancellation order ID and at least one output minimum must be non-zero");
    if (minNaraOut > UINT128_MAX || minUsdcOut > UINT128_MAX) throw new Error("Cancellation minimum exceeds uint128");
    return { orderId, minNaraOut, minUsdcOut, expectedStrategyHash: fields[3].toLowerCase() };
  });
  if (new Set(cancellations.map((item) => item.orderId.toString())).size !== cancellations.length) throw new Error("Cancellation order IDs must be unique");
  return { cancellations, reason: reasonArgument.slice("--reason=".length).trim() };
}

async function main(): Promise<void> {
  const { cancellations, reason } = parseArguments(process.argv.slice(2));
  const managerValue = process.env.RANGE_MANAGER_ADDRESS?.trim();
  if (!managerValue) throw new Error("RANGE_MANAGER_ADDRESS is required");
  const managerAddress = ethers.getAddress(managerValue);
  const strategyPath = resolve(process.env.V4_TREASURY_RANGE_STRATEGY_MANIFEST?.trim() || DEFAULT_STRATEGY);
  const strategy = loadTreasuryRangeStrategyManifest(strategyPath);
  // Exit construction deliberately remains available even when the external
  // USDC dependency has drifted; creation/deployment paths fail closed.
  const context = await readTreasuryRangeBuildContext(REPOSITORY_ROOT, strategyPath, strategy, { enforceUsdcDependency: false });
  const production = canonicalProductionV4Deployment();
  const deploymentEvidence = await readVerifiedTreasuryRangeManagerDeployment(REPOSITORY_ROOT, context, managerAddress);
  const expectedRuntimeHash = deploymentEvidence.runtimeCodeHash;
  await assertTreasuryRangeViewChecks(context, strategy.hookConfiguration.readChecks, "hookConfiguration.readChecks");
  const manager = new ethers.Contract(managerAddress, TREASURY_RANGE_MANAGER_ABI, context.provider);
  const managerSafetyState = await readTreasuryRangeManagerSafetyState(context, managerAddress);
  if (BigInt(await manager.MAX_SETTLE_BATCH({ blockTag: context.block.number })) !== 16n) throw new Error("Range Manager batch cap differs from 16");
  const bindings: ReadonlyArray<[string, string | number]> = [
    ["NARA", production.token], ["USDC", production.base], ["TREASURY_SAFE", production.safe],
    ["LIQUIDITY_VAULT", production.vault], ["POOL_MANAGER", production.poolManager],
    ["POSITION_MANAGER", production.positionManager], ["PERMIT2", production.permit2], ["HOOK", production.hook],
    ["POOL_FEE", production.poolFee], ["TICK_SPACING", production.tickSpacing], ["POOL_ID", production.poolId],
  ];
  for (const [method, expected] of bindings) {
    const actual = await manager.getFunction(method)({ blockTag: context.block.number });
    const matches = typeof expected === "string" && ethers.isAddress(String(expected))
      ? ethers.getAddress(actual) === ethers.getAddress(expected)
      : typeof expected === "string" ? String(actual).toLowerCase() === String(expected).toLowerCase() : BigInt(actual) === BigInt(expected);
    if (!matches) throw new Error(`Range Manager ${method} binding mismatch`);
  }
  const reviewedOrders: Array<Record<string, string | number>> = [];
  for (const cancellation of cancellations) {
    const order = await manager.getOrder(cancellation.orderId, { blockTag: context.block.number });
    if (Number(order.status ?? order[11]) !== 1) throw new Error(`Order ${cancellation.orderId} is not active`);
    if (String(order.strategyHash ?? order[3]).toLowerCase() !== cancellation.expectedStrategyHash) throw new Error(`Order ${cancellation.orderId} strategy hash mismatch`);
    reviewedOrders.push({
      orderId: cancellation.orderId.toString(),
      tokenId: BigInt(order.tokenId ?? order[0]).toString(),
      side: Number(order.side ?? order[10]),
      tickLower: Number(order.tickLower ?? order[5]),
      tickUpper: Number(order.tickUpper ?? order[6]),
      storedMinimumOutput: BigInt(order.minimumOutputAmount ?? order[2]).toString(),
      strategyHash: cancellation.expectedStrategyHash,
      minNaraOut: cancellation.minNaraOut.toString(),
      minUsdcOut: cancellation.minUsdcOut.toString(),
    });
  }
  const deadline = BigInt(jitDeadline(context.block.timestamp));
  const calls = cancellations.map((item) => ({
    to: managerAddress,
    value: "0",
    data: manager.interface.encodeFunctionData("cancel", [item.orderId, item.minNaraOut, item.minUsdcOut, deadline]),
  }));
  const result = await buildAndWriteTreasuryRangePacket({
    repositoryRoot: REPOSITORY_ROOT,
    outputDirectory: OUTPUT_DIRECTORY,
    slug: "cancellation",
    purpose: "NARA v4 Treasury Range order cancellation",
    context,
    calls,
    details: {
      strategyPath,
      managerAddress,
      managerRuntimeCodeHash: expectedRuntimeHash,
      managerDeployment: deploymentEvidence,
      managerSafetyState,
      deadline: deadline.toString(),
      reason,
      cancellations: reviewedOrders,
      managerPoolTokenBalances: {
        treatment: "alert-only because direct ERC20 donations are permissionless and cancellation cannot sweep them",
        naraRaw: managerSafetyState.managerNaraBalance,
        usdcRaw: managerSafetyState.managerUsdcBalance,
      },
    },
    checks: [
      "Confirm the cancellation reason and every active order ID/token ID/strategy hash.",
      "Review both per-order NARA and USDC minimum outputs; neither asset can be redirected away from the Safe.",
      "Confirm current pool and Hook state and any partial-fill exposure.",
      "Confirm every Safe->Manager, Manager->Permit2, and Permit2->PositionManager allowance is zero; donated manager balances are report-only.",
      "Confirm the complete Safe simulateAndRevert result; cancellation deliberately does not call the forceable-balance assertOperationalClean gate.",
      "Acknowledge emergency_exit_bypass: attached USDC dependency evidence is the strategy snapshot, not a JIT exact/healthy assertion; this bypass is cancellation-only.",
      "Recheck Safe nonce and deadline immediately before signing; never reuse this packet.",
    ],
    validUntil: Number(deadline),
  });
  process.stdout.write(`Unsigned cancellation packet: ${result.jsonPath}\nReview: ${result.markdownPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${safeTreasuryRangeError(error)}\n`);
  process.exitCode = 1;
});
