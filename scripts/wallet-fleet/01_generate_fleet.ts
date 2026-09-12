import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");
const CSV_FILE = path.join(__dirname, "fleet_addresses.csv");
const WALLET_COUNT = 100;

export async function generateFleet(count: number = WALLET_COUNT) {
  if (fs.existsSync(FLEET_FILE)) {
    console.warn(`?? Warning: ${FLEET_FILE} already exists. To re-generate, delete or back up the old file.`);
    return;
  }

  // Generate new random mnemonic
  const entropyWallet = ethers.Wallet.createRandom();
  const mnemonic = entropyWallet.mnemonic?.phrase;
  if (!mnemonic) throw new Error("Failed to generate secure BIP-39 mnemonic");

  console.log("================================================================================");
  console.log("?? MASTER FLEET BIP-39 MNEMONIC (BACK UP SECURELY — DO NOT SHARE):");
  console.log(mnemonic);
  console.log("================================================================================");

  const wallets: Array<{ index: number; address: string; privateKey: string; path: string }> = [];
  const csvLines: string[] = ["index,address"];

  for (let i = 0; i < count; i++) {
    const derivationPath = `m/44'/60'/0'/0/${i}`;
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
    wallets.push({
      index: i,
      address: ethers.getAddress(hdNode.address),
      privateKey: hdNode.privateKey,
      path: derivationPath,
    });
    csvLines.push(`${i},${ethers.getAddress(hdNode.address)}`);
  }

  const payload = {
    schemaVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    walletCount: count,
    mnemonic,
    wallets,
  };

  fs.writeFileSync(FLEET_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.writeFileSync(CSV_FILE, csvLines.join("\n"));

  console.log(`\n? Generated ${count} independent HD wallets!`);
  console.log(`?? Private fleet keystore saved: ${FLEET_FILE} (Strictly Gitignored)`);
  console.log(`?? Public address export saved:  ${CSV_FILE}`);
}

generateFleet().catch(console.error);
