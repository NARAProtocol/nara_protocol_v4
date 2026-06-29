/**
 * Deploy the stateless NARA v4 router and lens layer.
 *
 * Required env:
 *   ENGINE_V4
 *   POSITION_NFT_V4
 *
 * Optional env:
 *   ROUTER_ADDRESS
 *   BRIBE_REWARD_TOKEN
 *   BRIBE_MIN_AMOUNT
 *   V4_ALLOW_UNVERIFIED_ROUTER_LAYER=1
 *
 *   --- NARACirculatingSupplyV1 (market circulating-supply oracle) ---
 *   NARA_V4            token address (required to deploy the tracker)
 *   CIRC_EXCLUDED      comma-separated non-market wallets to net out. Launch set:
 *                        rewardReserve, bondVault, teamVestingWallet,
 *                        0x000000000000000000000000000000000000dEaD
 *                      (treasury is NOT excluded — earmarked for game sponsorship, so it
 *                       counts as circulating). Omit to skip the tracker. Must be unique, non-zero.
 *   CIRC_MAX_SUPPLY_CAP supply ceiling in wei (default 1_000_000e18).
 */

import hre from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE_CHAIN_ID = 8453n;

async function verify(address: string, args: any[]) {
  try {
    await (hre as any).run("verify:verify", { address, constructorArguments: args });
    console.log(`verified ${address}`);
  } catch (error: any) {
    if (error.message?.includes("Already Verified")) {
      console.log(`already verified ${address}`);
    } else if (process.env.V4_ALLOW_UNVERIFIED_ROUTER_LAYER === "1") {
      console.warn(`verify failed under explicit override: ${error.message}`);
    } else {
      throw new Error(`Source verification failed for ${address}: ${error.message}`);
    }
  }
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const isMainnet = network.chainId === BASE_CHAIN_ID;

  const engineAddress = process.env.ENGINE_V4
    ? ethers.getAddress(process.env.ENGINE_V4)
    : undefined;
  const nftAddress = process.env.POSITION_NFT_V4
    ? ethers.getAddress(process.env.POSITION_NFT_V4)
    : undefined;
  if (!engineAddress || !nftAddress) {
    throw new Error("Set ENGINE_V4 and POSITION_NFT_V4 in env");
  }

  console.log("Chain:   ", network.chainId.toString());
  console.log("Deployer:", deployer.address);

  let routerAddress = process.env.ROUTER_ADDRESS
    ? ethers.getAddress(process.env.ROUTER_ADDRESS)
    : undefined;

  if (!routerAddress) {
    console.log("\n-- NARARouter --");
    const Router = await ethers.getContractFactory("NARARouter");
    const router = await Router.deploy(engineAddress, nftAddress);
    await router.waitForDeployment();
    routerAddress = await router.getAddress();
    console.log("Deployed:", routerAddress);
    if (isMainnet) await verify(routerAddress, [engineAddress, nftAddress]);
  } else {
    console.log("\n-- NARARouter existing --");
    if ((await ethers.provider.getCode(routerAddress)) === "0x") {
      throw new Error(`ROUTER_ADDRESS has no code: ${routerAddress}`);
    }
    const router = await ethers.getContractAt("NARARouter", routerAddress);
    if (
      (await router.ENGINE()).toLowerCase() !== engineAddress.toLowerCase() ||
      (await router.NFT()).toLowerCase() !== nftAddress.toLowerCase()
    ) {
      throw new Error("ROUTER_ADDRESS is not paired with ENGINE_V4 and POSITION_NFT_V4");
    }
  }

  console.log("\n-- NARADashboardLens --");
  const DashboardLens = await ethers.getContractFactory("NARADashboardLens");
  const dashboardLens = await DashboardLens.deploy(engineAddress, nftAddress, routerAddress);
  await dashboardLens.waitForDeployment();
  const dashboardLensAddress = await dashboardLens.getAddress();
  console.log("Deployed:", dashboardLensAddress);
  if (isMainnet) await verify(dashboardLensAddress, [engineAddress, nftAddress, routerAddress]);

  console.log("\n-- NARAPositionDataLensV1 --");
  const PositionDataLens = await ethers.getContractFactory("NARAPositionDataLensV1");
  const positionDataLens = await PositionDataLens.deploy(engineAddress, nftAddress);
  await positionDataLens.waitForDeployment();
  const positionDataLensAddress = await positionDataLens.getAddress();
  console.log("Deployed:", positionDataLensAddress);
  if (isMainnet) await verify(positionDataLensAddress, [engineAddress, nftAddress]);

  console.log("\n-- NARAProtocolStatsLensV1 --");
  const ProtocolStatsLens = await ethers.getContractFactory("NARAProtocolStatsLensV1");
  const protocolStatsLens = await ProtocolStatsLens.deploy(engineAddress);
  await protocolStatsLens.waitForDeployment();
  const protocolStatsLensAddress = await protocolStatsLens.getAddress();
  console.log("Deployed:", protocolStatsLensAddress);
  if (isMainnet) await verify(protocolStatsLensAddress, [engineAddress]);

  console.log("\n-- BribeRouterV4 --");
  const bribeRewardToken = process.env.BRIBE_REWARD_TOKEN;
  const bribeMinAmount = process.env.BRIBE_MIN_AMOUNT;
  let bribeRouterAddress: string | null = null;
  if (bribeRewardToken && bribeMinAmount) {
    const rewardToken = ethers.getAddress(bribeRewardToken);
    const BribeRouter = await ethers.getContractFactory("BribeRouterV4");
    const bribeRouter = await BribeRouter.deploy(engineAddress, rewardToken, BigInt(bribeMinAmount));
    await bribeRouter.waitForDeployment();
    bribeRouterAddress = await bribeRouter.getAddress();
    console.log("Deployed:", bribeRouterAddress);
    console.log("ACTION REQUIRED: grant REWARD_NOTIFIER_ROLE to", bribeRouterAddress);
    if (isMainnet) await verify(bribeRouterAddress, [engineAddress, rewardToken, BigInt(bribeMinAmount)]);
  } else {
    console.log("Skipped. Set BRIBE_REWARD_TOKEN and BRIBE_MIN_AMOUNT to deploy.");
  }

  console.log("\n-- NARACirculatingSupplyV1 --");
  const ONE = 10n ** 18n;
  let circulatingSupplyAddress: string | null = null;
  const naraTokenForCirc = process.env.NARA_V4 ? ethers.getAddress(process.env.NARA_V4) : undefined;
  const circExcludedRaw = process.env.CIRC_EXCLUDED;
  if (naraTokenForCirc && circExcludedRaw) {
    const maxSupplyCap = process.env.CIRC_MAX_SUPPLY_CAP
      ? BigInt(process.env.CIRC_MAX_SUPPLY_CAP)
      : 1_000_000n * ONE;
    const excluded = circExcludedRaw
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
      .map((a) => ethers.getAddress(a));
    if ((await ethers.provider.getCode(naraTokenForCirc)) === "0x") {
      throw new Error(`NARA_V4 has no code: ${naraTokenForCirc}`);
    }
    const seen = new Set<string>();
    for (const a of excluded) {
      const key = a.toLowerCase();
      if (seen.has(key)) throw new Error(`CIRC_EXCLUDED contains a duplicate: ${a}`);
      seen.add(key);
    }
    const Circ = await ethers.getContractFactory("NARACirculatingSupplyV1");
    const circ = await Circ.deploy(naraTokenForCirc, maxSupplyCap, excluded);
    await circ.waitForDeployment();
    circulatingSupplyAddress = await circ.getAddress();
    console.log("Deployed:", circulatingSupplyAddress);
    console.log("Excluded:", excluded.join(", "));
    console.log("circulatingSupply:", (await circ.circulatingSupply()).toString());
    console.log("ACTION: submit excludedAccounts() to CoinGecko/CMC as the excluded list.");
    if (isMainnet) await verify(circulatingSupplyAddress, [naraTokenForCirc, maxSupplyCap, excluded]);
  } else {
    console.log("Skipped. Set NARA_V4 and CIRC_EXCLUDED to deploy the circulating-supply oracle.");
  }

  const output = {
    network: network.chainId.toString(),
    deployer: deployer.address,
    ENGINE_V4: engineAddress,
    POSITION_NFT_V4: nftAddress,
    NARARouter: routerAddress,
    NARADashboardLens: dashboardLensAddress,
    NARAPositionDataLensV1: positionDataLensAddress,
    NARAProtocolStatsLensV1: protocolStatsLensAddress,
    BribeRouterV4: bribeRouterAddress,
    NARACirculatingSupplyV1: circulatingSupplyAddress,
    timestamp: new Date().toISOString(),
  };

  console.log("\n-- Addresses --");
  console.log(JSON.stringify(output, null, 2));

  const directory = join(__dirname, "../deployments");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `router-lens-${network.chainId}.json`);
  writeFileSync(file, JSON.stringify(output, null, 2));
  console.log("Written:", file);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
