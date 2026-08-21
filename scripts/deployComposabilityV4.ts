/**
 * deployComposabilityV4.ts
 *
 * Deploys the NARA v4 composability layer:
 *   1. NARAStakingPoolV4     — stNARA liquid wrapper (ERC-20 shares over locked positions)
 *   2. NARAStakingPoolSYV4   — Pendle SY adapter (enables PT/YT yield tokenization)
 *   3. NARAFractionalPositionFactoryV4 — factory for fractionalizing individual positions
 *
 * Prerequisites (must be complete before running this script):
 *   - v4 core deployed: NARAToken, NARAEngine, NARAPositionNFTV4
 *   - NARA/USDC Uniswap V4 pool seeded
 *   - Bonds opened (at least partially) so TVL exists to justify stNARA
 *
 * Usage:
 *   NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
 *
 * Required env vars:
 *   BASE_RPC_URL, PRIVATE_KEY, BASESCAN_API_KEY
 *   NARA_TOKEN_V4, USDC_ADDRESS, ENGINE_V4, POSITION_NFT_V4, ADMIN_ADDRESS
 */

import hre from "hardhat";
import { writeFileSync } from "fs";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
} from "./lib/v4LiveConfig.js";

const BASE_CHAIN_ID = 8453n;

function envFlag(name: string): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function main() {
  throw new Error(
    "QUARANTINED: Position NFT composability deployment is Phase 3 and requires a separately reviewed release workflow " +
      "after the finalized Position NFT manifest exists.",
  );

  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const production = network.chainId === BASE_CHAIN_ID
    ? await assertProductionV4Runtime(ethers.provider, currentV4Config())
    : undefined;
  if (production) console.log(`Production runtime guard: ${productionV4RuntimeBanner(production!)}`);
  console.log("Deployer:", deployer.address);

  const NARA         = process.env.NARA_TOKEN_V4!;
  const USDC         = process.env.USDC_ADDRESS!;
  const ENGINE       = process.env.ENGINE_V4!;
  const POSITION_NFT = process.env.POSITION_NFT_V4!;
  const ADMIN        = process.env.ADMIN_ADDRESS;

  if (!NARA || !USDC || !ENGINE || !POSITION_NFT || !ADMIN) {
    throw new Error("Set NARA_TOKEN_V4, USDC_ADDRESS, ENGINE_V4, POSITION_NFT_V4, ADMIN_ADDRESS in env");
  }
  if (production) {
    if (ethers.getAddress(NARA) !== production!.token) throw new Error("NARA_TOKEN_V4 does not match production Token");
    if (ethers.getAddress(USDC) !== production!.base) throw new Error("USDC_ADDRESS does not match production Base USDC");
    if (ethers.getAddress(ENGINE) !== production!.engine) throw new Error("ENGINE_V4 does not match production Engine");
    if (ethers.getAddress(ADMIN!) !== production!.admin) throw new Error("ADMIN_ADDRESS does not match production admin Safe");
  }
  if (
    network.chainId === BASE_CHAIN_ID &&
    ADMIN!.toLowerCase() === deployer.address.toLowerCase() &&
    !envFlag("ALLOW_DEPLOYER_ADMIN")
  ) {
    throw new Error("ADMIN_ADDRESS must not be the deployer EOA on Base. Set ALLOW_DEPLOYER_ADMIN=1 only for intentional test deployments.");
  }

  console.log("\n── NARAStakingPoolV4 ──");
  const Pool = await ethers.getContractFactory("NARAStakingPoolV4");
  const pool = await Pool.deploy(NARA, USDC, ENGINE, POSITION_NFT, ADMIN!);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("Address:", poolAddr);

  console.log("\n── NARAStakingPoolSYV4 ──");
  const SY = await ethers.getContractFactory("NARAStakingPoolSYV4");
  const sy = await SY.deploy(NARA, USDC, poolAddr, poolAddr);
  await sy.waitForDeployment();
  const syAddr = await sy.getAddress();
  console.log("Address:", syAddr);

  console.log("\n── NARAFractionalPositionFactoryV4 ──");
  const Factory = await ethers.getContractFactory("NARAFractionalPositionFactoryV4");
  const factory = await Factory.deploy(NARA, USDC, ENGINE, POSITION_NFT);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("Address:", factoryAddr);

  console.log("\n── Verification ──");
  console.log("Pool NARA:          ", await pool.NARA());
  console.log("Pool USDC:          ", await pool.USDC());
  console.log("SY yieldToken:      ", await sy.yieldToken());
  console.log("SY exchangeRate:    ", await sy.exchangeRate());
  const [, assetAddr] = await sy.assetInfo();
  console.log("SY assetAddress:    ", assetAddr);

  const out = {
    NARAStakingPoolV4:                poolAddr,
    NARAStakingPoolSYV4:              syAddr,
    NARAFractionalPositionFactoryV4:  factoryAddr,
    inputs: { NARA, USDC, ENGINE, POSITION_NFT, ADMIN },
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  const outFile = `composability-v4-addresses-${Date.now()}.json`;
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\nAddresses saved to ${outFile}`);

  console.log("\n── Basescan verification ──");
  console.log(`npx hardhat verify --network base ${poolAddr} ${NARA} ${USDC} ${ENGINE} ${POSITION_NFT} ${ADMIN}`);
  console.log(`npx hardhat verify --network base ${syAddr} ${NARA} ${USDC} ${poolAddr} ${poolAddr}`);
  console.log(`npx hardhat verify --network base ${factoryAddr} ${NARA} ${USDC} ${ENGINE} ${POSITION_NFT}`);

  console.log(`
── Post-deploy checklist ──
[ ] Verify all three contracts on Basescan (commands above)
[ ] Transfer CONFIG_ROLE on pool to Safe multisig
[ ] Transfer EMERGENCY_ROLE on pool to Safe multisig
[ ] Seed first stNARA deposit (min 100 NARA) to bootstrap exchange rate
[ ] Create NARA/stNARA Uniswap pool for instant redemption path
[ ] Notify Pendle team with SY adapter address for PT/YT market creation: ${syAddr}
[ ] Update CURRENT_STATE.md with deployed addresses
[ ] Run harvest() to confirm USDC routing works end-to-end
[ ] Monitor exchange rate and USDC index for first 48h
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
