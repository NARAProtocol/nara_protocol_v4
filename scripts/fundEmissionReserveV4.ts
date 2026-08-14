/**
 * Fund the v4 NARAEngine emission reserve from the treasury wallet.
 *
 * Run after deploy when the deployer had insufficient NARA.
 * The treasury wallet received 1,000,000 NARA at launch and must approve + deposit.
 *
 * Required env:
 *   TREASURY_PRIVATE_KEY    treasury wallet private key
 *   BASE_RPC_URL            Base mainnet RPC
 *   V4_NARA_TOKEN           fresh v4 NARAToken address
 *   V4_ENGINE               fresh v4 NARAEngine address
 *
 * Optional env:
 *   V4_EMISSION_RESERVE_NARA  NARA amount to deposit (default 650000)
 */

import hre from "hardhat";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
} from "./lib/v4LiveConfig.js";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const config = currentV4Config();
  const deployment = await assertProductionV4Runtime(ethers.provider, config);
  console.log(`Production runtime guard: ${productionV4RuntimeBanner(deployment)}`);

  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) throw new Error("Missing TREASURY_PRIVATE_KEY");

  const treasurySigner = new ethers.Wallet(treasuryKey, ethers.provider);
  const tokenAddress = config.token;
  const engineAddress = config.engine;
  const amount = ethers.parseUnits(process.env.V4_EMISSION_RESERVE_NARA ?? "650000", 18);

  console.log("Fund emission reserve");
  console.log("Treasury:  ", treasurySigner.address);
  console.log("Token:     ", tokenAddress);
  console.log("Engine:    ", engineAddress);
  console.log("Amount:    ", ethers.formatUnits(amount, 18), "NARA");

  const token  = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken",   tokenAddress,  treasurySigner);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddress, treasurySigner);

  const balance = await token.balanceOf(treasurySigner.address);
  console.log("Treasury balance:", ethers.formatUnits(balance, 18), "NARA");
  if (balance < amount) throw new Error(`Insufficient NARA: have ${ethers.formatUnits(balance, 18)}, need ${ethers.formatUnits(amount, 18)}`);

  let tx = await token.approve(engineAddress, amount);
  console.log("approve:", tx.hash);
  await tx.wait(1);

  tx = await engine.depositRewards(amount);
  console.log("depositRewards:", tx.hash);
  await tx.wait(2);

  const reserve = (await engine.rewardReserveAvailable()) + (await engine.trackedEmissionReserve());
  console.log("Engine reserve after deposit:", ethers.formatUnits(reserve, 18), "NARA");
  console.log("Done.");
}

main().catch(err => { console.error(err); process.exitCode = 1; });
