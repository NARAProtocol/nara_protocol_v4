/**
 * Builds, but never submits, the Safe transaction for one live compounder
 * validation. After immutable on-chain evidence exists, rerun with --freeze
 * to build the separate one-way compounder freeze transaction.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const VAULT_ABI = [
  "function owner() view returns (address)",
  "function compounder() view returns (address)",
  "function compounderFrozen() view returns (bool)",
  "function routeMode() view returns (uint8)",
  "function balances() view returns (uint256 tokenBalance,uint256 baseBalance)",
  "function totalTokenCompounded() view returns (uint256)",
  "function totalBaseCompounded() view returns (uint256)",
  "function compoundAll(uint256 minLiquidityAdded,uint64 deadline,bytes data) returns (uint256 liquidityAdded)",
  "function freezeCompounder()",
];
const COMPOUNDER_ABI = [
  "function owner() view returns (address)",
  "function vault() view returns (address)",
  "function nara() view returns (address)",
  "function usdc() view returns (address)",
  "function positionTokenId() view returns (uint256)",
  "function totalLiquidityAdded() view returns (uint256)",
  "function totalNaraAdded() view returns (uint256)",
  "function totalUsdcAdded() view returns (uint256)",
  "function bankedBalances() view returns (uint256 naraBanked,uint256 usdcBanked)",
  "function pendingRecovery() view returns (uint8 kind,address to,uint64 eta)",
];
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
];

export function validationMinLiquidity(simulatedLiquidity: bigint, guardBps = 9_900n): bigint {
  if (simulatedLiquidity <= 0n) throw new Error("Simulated liquidity must be positive");
  if (guardBps <= 0n || guardBps > 10_000n) throw new Error("Liquidity guard must be within 1..10000 bps");
  const minimum = (simulatedLiquidity * guardBps) / 10_000n;
  return minimum > 0n ? minimum : 1n;
}

export function compounderFreezeReady(input: {
  positionTokenId: bigint;
  totalLiquidityAdded: bigint;
  positionLiquidity: bigint;
  positionOwnerMatches: boolean;
  pendingRecoveryKind: bigint;
}): boolean {
  return input.positionTokenId > 0n
    && input.totalLiquidityAdded > 0n
    && input.positionLiquidity > 0n
    && input.positionOwnerMatches
    && input.pendingRecoveryKind === 0n;
}

function builderFile(
  safe: string,
  name: string,
  to: string,
  data: string,
  evidence: Record<string, unknown>,
) {
  return {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name,
      description: "Single reviewed call. This file never submits a transaction.",
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: "",
    },
    transactions: [{
      to,
      value: "0",
      data,
      contractMethod: null,
      contractInputsValues: null,
    }],
    naraEvidence: evidence,
  };
}

async function main(): Promise<void> {
  const requestedMode = process.env.V4_COMPOUNDER_BUILD_MODE?.trim();
  if (requestedMode && requestedMode !== "validation" && requestedMode !== "freeze") {
    throw new Error("V4_COMPOUNDER_BUILD_MODE must be validation or freeze");
  }
  const freeze = process.argv.includes("--freeze") || requestedMode === "freeze";
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, 8453, { staticNetwork: true, batchMaxCount: 1 });
  try {
    const config = currentV4Config();
    const safe = ethers.getAddress(requiredEnv("V4_SAFE"));
    const compounderAddress = ethers.getAddress(requiredEnv("V4_COMPOUNDER"));
    const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
    const compounder = new ethers.Contract(compounderAddress, COMPOUNDER_ABI, provider);
    const [vaultOwner, configuredCompounder, frozen, routeMode, balances, totalTokenCompounded,
      totalBaseCompounded, compounderOwner, boundVault, nara, usdc, positionTokenId,
      totalLiquidityAdded, totalNaraAdded, totalUsdcAdded, banked, pendingRecovery, latestBlock] = await Promise.all([
      vault.owner() as Promise<string>,
      vault.compounder() as Promise<string>,
      vault.compounderFrozen() as Promise<boolean>,
      vault.routeMode() as Promise<bigint>,
      vault.balances() as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
      vault.totalTokenCompounded() as Promise<bigint>,
      vault.totalBaseCompounded() as Promise<bigint>,
      compounder.owner() as Promise<string>,
      compounder.vault() as Promise<string>,
      compounder.nara() as Promise<string>,
      compounder.usdc() as Promise<string>,
      compounder.positionTokenId() as Promise<bigint>,
      compounder.totalLiquidityAdded() as Promise<bigint>,
      compounder.totalNaraAdded() as Promise<bigint>,
      compounder.totalUsdcAdded() as Promise<bigint>,
      compounder.bankedBalances() as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
      compounder.pendingRecovery() as Promise<{ kind: bigint; to: string; eta: bigint }>,
      provider.getBlock("latest"),
    ]);
    if (!latestBlock) throw new Error("Latest Base block is unavailable");
    for (const [label, actual, expected] of [
      ["vault owner", vaultOwner, safe],
      ["vault compounder", configuredCompounder, compounderAddress],
      ["compounder owner", compounderOwner, safe],
      ["compounder vault", boundVault, config.vault],
      ["compounder NARA", nara, config.token],
      ["compounder USDC", usdc, config.base],
    ] as const) {
      if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
        throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
      }
    }
    if (routeMode !== 0n) throw new Error(`Vault routeMode must be Liquidity (0), got ${routeMode}`);
    if (pendingRecovery.kind !== 0n) throw new Error(`Compounder recovery kind ${pendingRecovery.kind} is pending`);

    let outputName: string;
    let output: ReturnType<typeof builderFile>;
    if (!freeze) {
      if (frozen) throw new Error("Compounder is already frozen");
      if (totalLiquidityAdded > 0n || positionTokenId > 0n) {
        throw new Error("Validation evidence already exists; verify it and rerun with --freeze");
      }
      if (balances.tokenBalance === 0n || balances.baseBalance === 0n) {
        throw new Error("Validation compound requires nonzero NARA and USDC vault balances");
      }
      const deadline = BigInt(latestBlock.timestamp) + 3_600n;
      const simulatedLiquidity = await vault.compoundAll.staticCall(1n, deadline, "0x", { from: safe }) as bigint;
      const minLiquidityAdded = validationMinLiquidity(simulatedLiquidity);
      await vault.compoundAll.staticCall(minLiquidityAdded, deadline, "0x", { from: safe });
      const data = vault.interface.encodeFunctionData("compoundAll", [minLiquidityAdded, deadline, "0x"]);
      outputName = "v4-compounder-validation-batch.json";
      output = builderFile(safe, "Validate NARA v4 liquidity compounder", config.vault, data, {
        changeId: "NARA-20260731-compounder-validation",
        mode: "validation-compound",
        vault: config.vault,
        compounder: compounderAddress,
        vaultNaraBefore: balances.tokenBalance.toString(),
        vaultUsdcBefore: balances.baseBalance.toString(),
        simulatedLiquidity: simulatedLiquidity.toString(),
        minLiquidityAdded: minLiquidityAdded.toString(),
        deadline: deadline.toString(),
        invariant: "execute and verify this transaction before separately building the one-way freeze",
      });
    } else {
      if (frozen) throw new Error("Compounder is already frozen");
      if (positionTokenId === 0n) throw new Error("No compounder position exists");
      const positionManager = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, provider);
      const [positionOwner, positionLiquidity] = await Promise.all([
        positionManager.ownerOf(positionTokenId) as Promise<string>,
        positionManager.getPositionLiquidity(positionTokenId) as Promise<bigint>,
      ]);
      const ready = compounderFreezeReady({
        positionTokenId,
        totalLiquidityAdded,
        positionLiquidity,
        positionOwnerMatches: ethers.getAddress(positionOwner) === compounderAddress,
        pendingRecoveryKind: pendingRecovery.kind,
      });
      if (!ready) throw new Error("Validated position evidence is incomplete; compounder freeze remains blocked");
      await vault.freezeCompounder.staticCall({ from: safe });
      const data = vault.interface.encodeFunctionData("freezeCompounder");
      outputName = "v4-compounder-freeze-batch.json";
      output = builderFile(safe, "Freeze NARA v4 liquidity compounder", config.vault, data, {
        changeId: "NARA-20260731-compounder-validation",
        mode: "one-way-freeze",
        vault: config.vault,
        compounder: compounderAddress,
        positionTokenId: positionTokenId.toString(),
        positionOwner,
        positionLiquidity: positionLiquidity.toString(),
        totalLiquidityAdded: totalLiquidityAdded.toString(),
        totalNaraAdded: totalNaraAdded.toString(),
        totalUsdcAdded: totalUsdcAdded.toString(),
        bankedNara: banked.naraBanked.toString(),
        bankedUsdc: banked.usdcBanked.toString(),
        vaultTotalTokenCompounded: totalTokenCompounded.toString(),
        vaultTotalBaseCompounded: totalBaseCompounded.toString(),
        invariant: "freezeCompounder is permanent and may execute only after verified live compound evidence",
      });
    }

    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, outputName);
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Safe batch written: ${outputPath}`);
    console.log(freeze
      ? "Freeze call simulated successfully. Review the one-way action before Safe execution."
      : "Validation compound simulated successfully. Execute and verify it before using --freeze.");
  } finally {
    provider.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
