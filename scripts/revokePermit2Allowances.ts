/**
 * Emergency & Cleanup Tool: Inspect & Revoke Permit2 / ERC-20 Approvals
 *
 * Checks active allowances on Base for USDC & NARA and cleanly revokes all
 * Universal Router & Permit2 approvals back to zero.
 *
 * Usage:
 *   npx tsx scripts/revokePermit2Allowances.ts
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const PINNED = {
  token: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const PERMIT2_ABI = [
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment");

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`\nChecking allowances for wallet: ${wallet.address} on Base...\n`);

  const usdc = new ethers.Contract(PINNED.base, ERC20_ABI, wallet);
  const nara = new ethers.Contract(PINNED.token, ERC20_ABI, wallet);
  const permit2 = new ethers.Contract(PINNED.permit2, PERMIT2_ABI, wallet);

  const [usdcErc20, naraErc20, usdcPermit2, naraPermit2] = await Promise.all([
    usdc.allowance(wallet.address, PINNED.permit2),
    nara.allowance(wallet.address, PINNED.permit2),
    permit2.allowance(wallet.address, PINNED.base, PINNED.universalRouter),
    permit2.allowance(wallet.address, PINNED.token, PINNED.universalRouter),
  ]);

  console.log("Current Allowance Status:");
  console.log(`  - USDC -> Permit2 (ERC20)        : ${usdcErc20 === 0n ? "0 (CLEAN ✅)" : usdcErc20.toString()}`);
  console.log(`  - NARA -> Permit2 (ERC20)        : ${naraErc20 === 0n ? "0 (CLEAN ✅)" : naraErc20.toString()}`);
  console.log(`  - USDC -> UniversalRouter (Permit2): ${usdcPermit2.amount === 0n ? "0 (CLEAN ✅)" : usdcPermit2.amount.toString()}`);
  console.log(`  - NARA -> UniversalRouter (Permit2): ${naraPermit2.amount === 0n ? "0 (CLEAN ✅)" : naraPermit2.amount.toString()}`);

  const hasActiveAllowances =
    usdcErc20 > 0n || naraErc20 > 0n || usdcPermit2.amount > 0n || naraPermit2.amount > 0n;

  if (!hasActiveAllowances) {
    console.log("\nAll allowances are already cleanly revoked to 0. No transaction required.\n");
    return;
  }

  console.log("\nRevoking active allowances to zero...");

  if (usdcPermit2.amount > 0n) {
    const feeData = await provider.getFeeData();
    const tx = await permit2.approve(PINNED.base, PINNED.universalRouter, 0n, 0n, {
      maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * 120n) / 100n : undefined,
    });
    console.log(`  -> Broadcasting USDC Permit2 revocation: ${tx.hash}`);
    await tx.wait(1);
    console.log("     Confirmed.");
    await sleep(2500);
  }

  if (naraPermit2.amount > 0n) {
    const feeData = await provider.getFeeData();
    const tx = await permit2.approve(PINNED.token, PINNED.universalRouter, 0n, 0n, {
      maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * 120n) / 100n : undefined,
    });
    console.log(`  -> Broadcasting NARA Permit2 revocation: ${tx.hash}`);
    await tx.wait(1);
    console.log("     Confirmed.");
    await sleep(2500);
  }

  console.log("\nAll allowances have been successfully revoked to zero.\n");
}

main().catch(console.error);
