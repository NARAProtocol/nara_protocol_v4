import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return fallback;
}
const isDryRun = args.includes("--dry-run");
const count = Number(getArg("--count", "15"));
const ethAmountPerWallet = getArg("--eth", "0.001"); // ~ $2.80 - $3.00 USD
const funderPk = process.env.FUNDER_PRIVATE_KEY || "";

async function main() {
  console.log("================================================================================");
  console.log("  NARA v4 FLEET GAS FUNDER: ETH DISPERSAL HELPER");
  console.log("================================================================================");
  console.log(`Execution Mode:     ${isDryRun ? "🧪 DRY-RUN (Simulation only)" : "🔥 LIVE DISPERSAL BROADCAST"}`);
  console.log(`Wallets to Fund:    ${count} wallets`);
  console.log(`Amount per Wallet:  ${ethAmountPerWallet} ETH (~$2.80 - $3.00 USD)`);
  console.log(`Total ETH Needed:   ~${(Number(ethAmountPerWallet) * count).toFixed(4)} ETH`);
  console.log("================================================================================\n");

  if (!fs.existsSync(FLEET_FILE)) {
    console.error(`❌ Fleet wallet registry not found at ${FLEET_FILE}`);
    process.exit(1);
  }

  const fleetData = JSON.parse(fs.readFileSync(FLEET_FILE, "utf8"));
  const fleetWallets = fleetData.wallets.slice(0, count) as Array<{ index: number; address: string }>;

  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  if (isDryRun || !funderPk) {
    if (!funderPk && !isDryRun) {
      console.log("⚠️ FUNDER_PRIVATE_KEY not set in .env. Running in DRY-RUN mode:\n");
    }
    console.log("Target Wallets to receive ETH:");
    fleetWallets.forEach((w) => {
      console.log(`  • Wallet #${String(w.index).padStart(2, "0")}: ${w.address} <- ${ethAmountPerWallet} ETH`);
    });
    console.log(`\n✅ Ready. Set FUNDER_PRIVATE_KEY in .env or run with --dry-run.`);
    return;
  }

  const funderWallet = new ethers.Wallet(funderPk, provider);
  const funderBal = await provider.getBalance(funderWallet.address);
  const weiPerWallet = ethers.parseEther(ethAmountPerWallet);
  const totalWeiNeeded = weiPerWallet * BigInt(count);

  console.log(`Funder Address: ${funderWallet.address}`);
  console.log(`Funder Balance: ${ethers.formatEther(funderBal)} ETH`);

  if (funderBal < totalWeiNeeded) {
    console.error(`❌ Insufficient ETH in funder wallet. Have ${ethers.formatEther(funderBal)} ETH, need ${ethers.formatEther(totalWeiNeeded)} ETH.`);
    process.exit(1);
  }

  console.log("\nBroadcasting ETH dispersals...");
  for (const item of fleetWallets) {
    const targetBal = await provider.getBalance(item.address);
    if (targetBal >= weiPerWallet) {
      console.log(`  • Wallet #${item.index} already has ${ethers.formatEther(targetBal)} ETH. Skipping.`);
      continue;
    }

    console.log(`  • Funding Wallet #${item.index} (${item.address.slice(0, 6)}...${item.address.slice(-4)}) with ${ethAmountPerWallet} ETH...`);
    const tx = await funderWallet.sendTransaction({
      to: item.address,
      value: weiPerWallet,
    });
    await tx.wait();
    console.log(`    ✅ Confirmed: ${tx.hash}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n🎉 ETH Funding Complete! All targeted fleet wallets are gas-ready.\n");
}

main().catch((err) => {
  console.error("Fatal Funding error:", err);
  process.exit(1);
});