import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { currentV4Config } from "../lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return fallback;
}
const isDryRun = args.includes("--dry-run");
const destinationAddress = getArg("--to", process.env.SWEEP_RECOVERY_ADDRESS || "");

async function main() {
  console.log("================================================================================");
  console.log("  NARA v4 FLEET SWEEPER: 100% CAPITAL RECOVERY & FUND RECALL");
  console.log("================================================================================");
  console.log(`Execution Mode:     ${isDryRun ? "ðŸ§ª DRY-RUN (Audit only, no txs)" : "ðŸ”¥ LIVE SWEEP BROADCAST"}`);
  console.log(`Destination:        ${destinationAddress || "âŒ NOT SPECIFIED (Use --to 0x...)"}`);
  console.log("Assets Recovered:   USDC, NARA, and all remaining ETH (gas)");
  console.log("================================================================================\n");

  if (!destinationAddress || !ethers.isAddress(destinationAddress)) {
    console.error("âŒ ERROR: Valid recovery destination address required.");
    console.error("   Usage: npx tsx scripts/wallet-fleet/06_sweep_fleet.ts --to <YOUR_SAFE_OR_WALLET> [--dry-run]");
    process.exit(1);
  }

  if (!fs.existsSync(FLEET_FILE)) {
    console.error(`âŒ Fleet wallet registry not found at ${FLEET_FILE}`);
    process.exit(1);
  }

  const fleetData = JSON.parse(fs.readFileSync(FLEET_FILE, "utf8"));
  const fleetWallets = fleetData.wallets as Array<{ index: number; address: string; privateKey: string }>;

  const config = currentV4Config();
  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  const usdcAddress = config.base;
  const naraAddress = config.token;

  let totalUsdcSwept = 0n;
  let totalNaraSwept = 0n;
  let totalEthSwept = 0n;
  let walletsProcessed = 0;

  console.log(`Scanning and sweeping balances for ${fleetWallets.length} fleet wallets...\n`);

  for (const item of fleetWallets) { await new Promise((r) => setTimeout(r, 40));
    const wallet = new ethers.Wallet(item.privateKey, provider);
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, wallet);
    const nara = new ethers.Contract(naraAddress, ERC20_ABI, wallet);

    const [ethBal, usdcBal, naraBal] = await Promise.all([
      provider.getBalance(wallet.address),
      usdc.balanceOf(wallet.address) as Promise<bigint>,
      nara.balanceOf(wallet.address) as Promise<bigint>,
    ]);

    if (ethBal === 0n && usdcBal === 0n && naraBal === 0n) {
      continue;
    }

    walletsProcessed++;
    console.log(`[Wallet #${item.index} - ${item.address.slice(0, 6)}...${item.address.slice(-4)}]`);
    console.log(`  Holdings: ${ethers.formatEther(ethBal)} ETH | $${(Number(usdcBal) / 1e6).toFixed(2)} USDC | ${(Number(naraBal) / 1e18).toFixed(2)} NARA`);

    if (isDryRun) {
      totalUsdcSwept += usdcBal;
      totalNaraSwept += naraBal;
      totalEthSwept += ethBal;
      continue;
    }

    // 1. Sweep USDC
    if (usdcBal > 0n) {
      try {
        console.log(`  -> Sweeping $${(Number(usdcBal) / 1e6).toFixed(2)} USDC...`);
        const tx = await usdc.transfer(destinationAddress, usdcBal);
        await tx.wait();
        totalUsdcSwept += usdcBal;
        console.log(`     âœ… USDC swept: ${tx.hash}`);
      } catch (err: any) {
        console.error(`     âŒ Failed to sweep USDC: ${err.message}`);
      }
    }

    // 2. Sweep NARA
    if (naraBal > 0n) {
      try {
        console.log(`  -> Sweeping ${(Number(naraBal) / 1e18).toFixed(2)} NARA...`);
        const tx = await nara.transfer(destinationAddress, naraBal);
        await tx.wait();
        totalNaraSwept += naraBal;
        console.log(`     âœ… NARA swept: ${tx.hash}`);
      } catch (err: any) {
        console.error(`     âŒ Failed to sweep NARA: ${err.message}`);
      }
    }

    // 3. Sweep remaining ETH
    const currentEth = await provider.getBalance(wallet.address);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
    const gasCost = 21_000n * gasPrice;

    if (currentEth > gasCost) {
      const ethToSend = currentEth - gasCost;
      try {
        console.log(`  -> Sweeping ${ethers.formatEther(ethToSend)} ETH...`);
        const tx = await wallet.sendTransaction({
          to: destinationAddress,
          value: ethToSend,
          gasLimit: 21_000n,
          gasPrice,
        });
        await tx.wait();
        totalEthSwept += ethToSend;
        console.log(`     âœ… ETH swept: ${tx.hash}`);
      } catch (err: any) {
        console.error(`     âŒ Failed to sweep ETH: ${err.message}`);
      }
    }
  }

  console.log("\n================================================================================");
  console.log("  ðŸŽ‰ FLEET SWEEP COMPLETE!");
  console.log(`  Destination Wallet   : ${destinationAddress}`);
  console.log(`  Wallets Swept        : ${walletsProcessed}`);
  console.log(`  Total USDC Recovered : $${(Number(totalUsdcSwept) / 1e6).toFixed(2)} USDC`);
  console.log(`  Total NARA Recovered : ${(Number(totalNaraSwept) / 1e18).toFixed(2)} NARA`);
  console.log(`  Total ETH Recovered  : ${ethers.formatEther(totalEthSwept)} ETH`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Fatal Sweep error:", err);
  process.exit(1);
});