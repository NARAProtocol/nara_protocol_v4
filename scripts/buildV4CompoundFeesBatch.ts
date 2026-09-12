/**
 * Builds the Safe Transaction Builder JSON batch to compound all available
 * NARA v4 protocol fees from NARALiquidityGrowthVault into Uniswap v4 POL.
 *
 * This script runs in read-only mode, validates all immutable bindings,
 * simulates compoundAll() via staticCall on Base mainnet, and outputs
 * the Safe batch JSON file ready for Safe Transaction Builder import.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl } from "./lib/v4LiveConfig.js";
import { readSqrtPriceX96 } from "./lib/v4SwapSafety.js";
import { compoundConstraintsData } from "./maintainV4Liquidity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const VAULT_ABI = [
  "function owner() view returns (address)",
  "function compounder() view returns (address)",
  "function compounderFrozen() view returns (bool)",
  "function routeMode() view returns (uint8)",
  "function balances() view returns (uint256 tokenBalance, uint256 baseBalance)",
  "function totalTokenCompounded() view returns (uint256)",
  "function totalBaseCompounded() view returns (uint256)",
  "function compoundAll(uint256 minLiquidityAdded, uint64 deadline, bytes data) returns (uint256 liquidityAdded)",
];

const COMPOUNDER_ABI = [
  "function owner() view returns (address)",
  "function vault() view returns (address)",
  "function positionTokenId() view returns (uint256)",
  "function totalLiquidityAdded() view returns (uint256)",
  "function totalNaraAdded() view returns (uint256)",
  "function totalUsdcAdded() view returns (uint256)",
  "function bankedBalances() view returns (uint256 naraBanked, uint256 usdcBanked)",
];

const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
];

export function buildSafeBatchJson(
  safeAddress: string,
  vaultAddress: string,
  minLiquidityAdded: bigint,
  deadline: bigint,
  constraintsData: string,
  callData: string,
) {
  return {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: "Compound NARA v4 All Available Protocol Fees",
      description: "Compounds all uncompounded Vault fees and banked surplus inventory into permanent Uniswap v4 Protocol-Owned Liquidity (POL).",
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: safeAddress,
      createdFromOwnerAddress: "",
    },
    transactions: [
      {
        to: vaultAddress,
        value: "0",
        data: callData,
        contractMethod: {
          inputs: [
            {
              internalType: "uint256",
              name: "minLiquidityAdded",
              type: "uint256",
            },
            {
              internalType: "uint64",
              name: "deadline",
              type: "uint64",
            },
            {
              internalType: "bytes",
              name: "data",
              type: "bytes",
            },
          ],
          name: "compoundAll",
          payable: false,
        },
        contractInputsValues: {
          minLiquidityAdded: minLiquidityAdded.toString(),
          deadline: deadline.toString(),
          data: constraintsData,
        },
      },
    ],
  };
}

async function main(): Promise<void> {
  const rpcUrl = requiredBaseRpcUrl();
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true, batchMaxCount: 1 });

  try {
    const config = currentV4Config();
    const safeAddress = ethers.getAddress(process.env.V4_SAFE || "0xd65c0e390Dc187A22c52c03816591CC736C0D755");
    const vaultAddress = ethers.getAddress(config.vault);
    const compounderAddress = ethers.getAddress(process.env.V4_COMPOUNDER || "0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF");

    console.log("=== NARA v4 Safe Compound Batch Builder ===");
    console.log(`Network: Base Mainnet (8453)`);
    console.log(`Production Safe: ${safeAddress}`);
    console.log(`Vault:           ${vaultAddress}`);
    console.log(`Compounder:      ${compounderAddress}`);

    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
    const compounder = new ethers.Contract(compounderAddress, COMPOUNDER_ABI, provider);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    const [
      vaultOwner,
      boundCompounder,
      isFrozen,
      routeMode,
      vaultBalances,
      compounderOwner,
      compBanked,
      posTokenId,
      safeNonce,
      safeThreshold,
      safeOwners,
      latestBlock,
    ] = await Promise.all([
      vault.owner() as Promise<string>,
      vault.compounder() as Promise<string>,
      vault.compounderFrozen() as Promise<boolean>,
      vault.routeMode() as Promise<bigint>,
      vault.balances() as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
      compounder.owner() as Promise<string>,
      compounder.bankedBalances() as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
      compounder.positionTokenId() as Promise<bigint>,
      safe.nonce() as Promise<bigint>,
      safe.getThreshold() as Promise<bigint>,
      safe.getOwners() as Promise<string[]>,
      provider.getBlock("latest"),
    ]);

    if (!latestBlock) throw new Error("Could not retrieve latest block");

    console.log(`Safe Nonce:      ${safeNonce}`);
    console.log(`Safe Threshold:  ${safeThreshold} of ${safeOwners.length}`);
    console.log(`POL Token ID:    #${posTokenId}`);

    if (ethers.getAddress(vaultOwner) !== safeAddress) {
      throw new Error(`Vault owner mismatch: expected ${safeAddress}, got ${vaultOwner}`);
    }
    if (ethers.getAddress(boundCompounder) !== compounderAddress) {
      throw new Error(`Vault compounder mismatch: expected ${compounderAddress}, got ${boundCompounder}`);
    }
    if (ethers.getAddress(compounderOwner) !== safeAddress) {
      throw new Error(`Compounder owner mismatch: expected ${safeAddress}, got ${compounderOwner}`);
    }
    if (!isFrozen) {
      throw new Error("Compounder is not frozen");
    }
    if (routeMode !== 0n) {
      throw new Error(`Vault routeMode is not Liquidity (0), got ${routeMode}`);
    }

    console.log("\n--- Current Inventory ---");
    console.log(`Vault NARA:      ${ethers.formatEther(vaultBalances.tokenBalance)} NARA`);
    console.log(`Vault USDC:      ${ethers.formatUnits(vaultBalances.baseBalance, 6)} USDC`);
    console.log(`Banked NARA:     ${ethers.formatEther(compBanked.naraBanked)} NARA`);
    console.log(`Banked USDC:     ${ethers.formatUnits(compBanked.usdcBanked, 6)} USDC`);

    if (vaultBalances.tokenBalance === 0n && vaultBalances.baseBalance === 0n) {
      throw new Error("Vault balances are zero. Nothing to compound.");
    }

    const currentSqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
    console.log(`\nPool SqrtPrice:  ${currentSqrtPriceX96.toString()}`);

    // Set 24h deadline for multisig threshold signing
    const deadline = BigInt(latestBlock.timestamp) + 86400n;

    // Safety constraints:
    // sqrtGuardBps: 200 bps (2.0% sqrt-price band, max contract allows is 250 bps)
    // maxReferenceValueImbalanceBps: 250 bps (2.5%, max contract allows is 500 bps)
    // maxNaraUsed / maxUsdcUsed: covers entire vault balance + banked remainder + safety headroom
    const sqrtGuardBps = 200n;
    const maxReferenceValueImbalanceBps = 250n;
    const maxNaraUsed = vaultBalances.tokenBalance + compBanked.naraBanked + ethers.parseEther("500");
    const maxUsdcUsed = vaultBalances.baseBalance + compBanked.usdcBanked + ethers.parseUnits("50", 6);

    const constraintsData = compoundConstraintsData(
      currentSqrtPriceX96,
      maxNaraUsed,
      maxUsdcUsed,
      sqrtGuardBps,
      maxReferenceValueImbalanceBps,
    );

    console.log("Simulating compoundAll on live Base state...");
    const simulatedLiquidity = await vault.compoundAll.staticCall(
      1n,
      deadline,
      constraintsData,
      { from: safeAddress },
    ) as bigint;
    console.log(`Simulated Liquidity: ${simulatedLiquidity.toString()}`);

    // Apply 1% slippage guard (99% minimum liquidity)
    const minLiquidityAdded = (simulatedLiquidity * 9900n) / 10000n;
    console.log(`Min Liquidity Guard: ${minLiquidityAdded.toString()} (1.0% max slippage)`);

    // Verify static call with minLiquidityAdded succeeds
    await vault.compoundAll.staticCall(
      minLiquidityAdded,
      deadline,
      constraintsData,
      { from: safeAddress },
    );
    console.log("StaticCall with minLiquidityAdded VERIFIED successfully!");

    const callData = vault.interface.encodeFunctionData("compoundAll", [
      minLiquidityAdded,
      deadline,
      constraintsData,
    ]);

    const batch = buildSafeBatchJson(
      safeAddress,
      vaultAddress,
      minLiquidityAdded,
      deadline,
      constraintsData,
      callData,
    );

    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const outputPath = resolve(outputDir, "v4-compound-fees-safe-batch.json");
    writeFileSync(outputPath, JSON.stringify(batch, null, 2) + "\n");

    console.log(`\nSafe Transaction Builder Batch generated at:`);
    console.log(`${outputPath}`);
    console.log("\n=== Execution Summary ===");
    console.log(`- Target: ${vaultAddress} (NARALiquidityGrowthVault)`);
    console.log(`- Method: compoundAll(minLiquidityAdded, deadline, data)`);
    console.log(`- minLiquidityAdded: ${minLiquidityAdded.toString()}`);
    console.log(`- deadline: ${deadline.toString()} (valid for 24 hours from block ${latestBlock.number})`);
    console.log(`- Call Data: ${callData.slice(0, 34)}... (length: ${callData.length} chars)`);
  } finally {
    provider.destroy();
  }
}

main().catch((err) => {
  console.error("Batch build failed:", err);
  process.exit(1);
});
