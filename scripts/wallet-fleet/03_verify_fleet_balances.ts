import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { canonicalProductionV4Deployment } from "../lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL_ABI = [
  "function getEthBalance(address addr) view returns (uint256 balance)",
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

export async function main() {
  if (!fs.existsSync(FLEET_FILE)) {
    throw new Error(`Fleet keystore ${FLEET_FILE} not found. Run '01_generate_fleet.ts' first.`);
  }

  const prod = canonicalProductionV4Deployment();
  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  const fleetData = JSON.parse(fs.readFileSync(FLEET_FILE, "utf8"));
  const wallets = fleetData.wallets as Array<{ index: number; address: string }>;

  console.log("================================================================================");
  console.log(`?? AUDITING BALANCES FOR ${wallets.length} FLEET WALLETS`);
  console.log("================================================================================");

  const erc20Iface = new ethers.Interface(ERC20_ABI);
  const multicallIface = new ethers.Interface(MULTICALL_ABI);
  const multicall = new ethers.Contract(MULTICALL3, MULTICALL_ABI, provider);

  // Build multicall queries: ETH balance, USDC balance, NARA balance
  const calls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];

  for (const w of wallets) {
    calls.push({ target: MULTICALL3, allowFailure: false, callData: multicallIface.encodeFunctionData("getEthBalance", [w.address]) });
    calls.push({ target: prod.base, allowFailure: false, callData: erc20Iface.encodeFunctionData("balanceOf", [w.address]) });
    calls.push({ target: prod.token, allowFailure: false, callData: erc20Iface.encodeFunctionData("balanceOf", [w.address]) });
  }

  const results: Array<{ success: boolean; returnData: string }> = await multicall.aggregate3.staticCall(calls);

  let totalEth = 0n;
  let totalUsdc = 0n;
  let totalNara = 0n;
  let gasReadyCount = 0;
  let usdcFundedCount = 0;

  console.log("\nIDX | Address                                    | ETH (Gas)       | USDC       | NARA");
  console.log("----+--------------------------------------------+-----------------+------------+-------------");

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const ethBal = BigInt(multicallIface.decodeFunctionResult("getEthBalance", results[i * 3].returnData)[0]);
    const usdcBal = BigInt(erc20Iface.decodeFunctionResult("balanceOf", results[i * 3 + 1].returnData)[0]);
    const naraBal = BigInt(erc20Iface.decodeFunctionResult("balanceOf", results[i * 3 + 2].returnData)[0]);

    totalEth += ethBal;
    totalUsdc += usdcBal;
    totalNara += naraBal;

    if (ethBal >= ethers.parseEther("0.0001")) gasReadyCount++;
    if (usdcBal >= ethers.parseUnits("1.0", 6)) usdcFundedCount++;

    const ethFmt = ethers.formatEther(ethBal).padEnd(15, " ");
    const usdcFmt = ethers.formatUnits(usdcBal, 6).padEnd(10, " ");
    const naraFmt = ethers.formatUnits(naraBal, 18).slice(0, 10);

    if (i < 10 || i >= wallets.length - 5 || usdcBal > 0n || ethBal > 0n) {
      console.log(`${String(w.index).padStart(3, " ")} | ${w.address} | ${ethFmt} | ${usdcFmt} | ${naraFmt}`);
    } else if (i === 10) {
      console.log(`... | ... [${wallets.length - 15} more zero-balance wallets hidden] ...`);
    }
  }

  console.log("----+--------------------------------------------+-----------------+------------+-------------");
  console.log(`TOTAL ETH:  ${ethers.formatEther(totalEth)} ETH`);
  console.log(`TOTAL USDC: ${ethers.formatUnits(totalUsdc, 6)} USDC`);
  console.log(`TOTAL NARA: ${ethers.formatUnits(totalNara, 18)} NARA`);
  console.log(`STATUS:     ${gasReadyCount}/${wallets.length} gas-ready, ${usdcFundedCount}/${wallets.length} USDC-funded`);
}

main().catch(console.error);
