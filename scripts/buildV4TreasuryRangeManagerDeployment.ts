/** Build an unsigned, nonce-bound Safe packet. This file never creates a signer or sends a transaction. */
import hre from "hardhat";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalProductionV4Deployment } from "./lib/v4LiveConfig.js";
import {
  assertTreasuryRangeCanaryLaunchManifest,
  assertTreasuryRangeManifestExactEvidence,
  loadTreasuryRangeStrategyManifest,
} from "./lib/v4TreasuryRangeManifest.js";
import {
  CREATE2_DEPLOYER_ABI,
  assertTreasuryRangeViewChecks,
  assertTreasuryRangeUsdcDependency,
  buildAndWriteTreasuryRangePacket,
  forceRebuildTreasuryRangeManagerArtifact,
  jitDeadline,
  readTreasuryRangeBuildContext,
  safeTreasuryRangeError,
} from "./lib/v4TreasuryRangeSafeBuilder.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STRATEGY = resolve(REPOSITORY_ROOT, "deployments", "v4-treasury-range-strategy-candidate.json");
const OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "deployments");
const MANAGER_FQN = "contracts/v4/NARATreasuryRangeManagerV1.sol:NARATreasuryRangeManagerV1";
const UINT64_MAX = (1n << 64n) - 1n;

export async function buildV4TreasuryRangeManagerDeployment(): Promise<void> {
  const strategyPath = resolve(process.env.V4_TREASURY_RANGE_STRATEGY_MANIFEST?.trim() || DEFAULT_STRATEGY);
  const strategy = loadTreasuryRangeStrategyManifest(strategyPath);
  assertTreasuryRangeManifestExactEvidence(strategy);
  assertTreasuryRangeCanaryLaunchManifest(strategy);
  // Never trust ignored/cacheable artifact bytes. Rebuild before taking the
  // JIT block/nonce/deadline snapshot used by the proposal.
  await forceRebuildTreasuryRangeManagerArtifact(hre.tasks);
  let context = await readTreasuryRangeBuildContext(REPOSITORY_ROOT, strategyPath, strategy);
  const production = canonicalProductionV4Deployment();
  if (strategy.addresses.liquidityVault === undefined || ethers.getAddress(strategy.addresses.liquidityVault) !== production.vault) {
    throw new Error("Strategy liquidityVault differs from the canonical production manifest");
  }
  await assertTreasuryRangeViewChecks(context, strategy.hookConfiguration.readChecks, "hookConfiguration.readChecks");
  const deploymentDeadline = BigInt(jitDeadline(context.block.timestamp));
  if (deploymentDeadline > UINT64_MAX) throw new Error("Deployment deadline exceeds uint64");
  const artifact = await hre.artifacts.readArtifact(MANAGER_FQN);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
  const deployment = await factory.getDeployTransaction(
    production.safe,
    production.token,
    production.base,
    production.vault,
    production.poolManager,
    production.positionManager,
    production.permit2,
    production.hook,
    production.poolFee,
    production.tickSpacing,
    production.poolId,
    deploymentDeadline,
  );
  if (!deployment.data) throw new Error("Manager initcode is unavailable");
  const initCode = ethers.hexlify(deployment.data);
  const initCodeBytes = ethers.getBytes(initCode).length;
  if (initCodeBytes > 49_152) throw new Error(`Manager initcode exceeds EIP-3860: ${initCodeBytes} bytes`);
  const initCodeHash = ethers.keccak256(initCode);
  const salt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "bytes32", "bytes20", "bytes32"],
    [strategy.changeId, strategy.strategyHash, `0x${strategy.repositoryHead}`, initCodeHash],
  ));
  const create2 = new ethers.Contract(production.create2HookDeployer, CREATE2_DEPLOYER_ABI, context.provider);
  const [owner, predicted] = await Promise.all([
    create2.owner({ blockTag: context.block.number }),
    create2.computeAddress(salt, initCodeHash, { blockTag: context.block.number }),
  ]);
  if (ethers.getAddress(owner) !== production.safe) throw new Error("CREATE2 deployer owner is not the production Safe");
  if (await context.provider.getCode(predicted, context.block.number) !== "0x") throw new Error("Predicted manager address is already occupied");
  const usdcDependency = await assertTreasuryRangeUsdcDependency(context, { rangeManager: predicted });
  context = { ...context, usdcDependency };
  const simulatedRuntime = await context.provider.send("eth_call", [
    { from: production.safe, data: initCode },
    ethers.toQuantity(context.block.number),
  ]);
  if (typeof simulatedRuntime !== "string" || simulatedRuntime === "0x") throw new Error("Manager constructor simulation returned no runtime code");
  const runtimeBytes = ethers.getBytes(simulatedRuntime).length;
  if (runtimeBytes > 24_576) throw new Error(`Manager runtime exceeds EIP-170: ${runtimeBytes} bytes`);
  const runtimeCodeHash = ethers.keccak256(simulatedRuntime).toLowerCase();
  const expectedRuntimeHash = strategy.runtimeCodeHashes.rangeManager?.toLowerCase();
  if (!expectedRuntimeHash || runtimeCodeHash !== expectedRuntimeHash) {
    throw new Error("Constructor-simulated manager runtime hash differs from the strategy manifest");
  }
  const call = {
    to: production.create2HookDeployer,
    value: "0",
    data: create2.interface.encodeFunctionData("deploy", [salt, initCode]),
  };
  const result = await buildAndWriteTreasuryRangePacket({
    repositoryRoot: REPOSITORY_ROOT,
    outputDirectory: OUTPUT_DIRECTORY,
    slug: "deployment",
    purpose: "NARA v4 Treasury Range Manager deployment",
    context,
    calls: [call],
    details: {
      strategyPath,
      deployer: production.create2HookDeployer,
      predictedManager: ethers.getAddress(predicted),
      salt,
      initCodeHash,
      initCodeBytes,
      runtimeCodeHash,
      runtimeBytes,
      deploymentDeadline: deploymentDeadline.toString(),
      constructorArguments: {
        treasurySafe: production.safe,
        nara: production.token,
        usdc: production.base,
        liquidityVault: production.vault,
        poolManager: production.poolManager,
        positionManager: production.positionManager,
        permit2: production.permit2,
        hook: production.hook,
        poolFee: production.poolFee,
        tickSpacing: production.tickSpacing,
        poolId: production.poolId,
      },
    },
    checks: [
      "Verify predicted manager, CREATE2 salt, initcode hash, and constructor-simulated runtime hash.",
      "Verify every immutable binding and the deployment deadline.",
      "Recheck Safe nonce, current Base block, Hook configuration, and strategy hash immediately before signing.",
      "Obtain independent contract/security review; this candidate is not audited or production-approved.",
      "Do not import, sign, or execute after the recorded deadline.",
    ],
    validUntil: Number(deploymentDeadline),
  });
  process.stdout.write(`Unsigned deployment packet: ${result.jsonPath}\nReview: ${result.markdownPath}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void buildV4TreasuryRangeManagerDeployment().catch((error) => {
    process.stderr.write(`${safeTreasuryRangeError(error)}\n`);
    process.exitCode = 1;
  });
}
