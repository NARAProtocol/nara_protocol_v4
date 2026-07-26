import hre from "hardhat";
import { deployRenderer } from "../test/helpers/art";
import * as fs from "fs";

const LOCK_FEE = 10n ** 14n;

async function main() {
  const { ethers } = await (hre.network as any).connect();
  const [deployer] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const nara = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();

  const RewardToken = await ethers.getContractFactory("MockERC20", deployer);
  const usdc = await RewardToken.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const accountImpl = await Account.deploy();
  await accountImpl.waitForDeployment();

  const renderer = await deployRenderer(ethers, deployer);

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const nft = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    await deployer.getAddress(),
    await deployer.getAddress(),
    500
  );
  await nft.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const genesisDistributor = await Distributor.deploy(await nft.getAddress(), await usdc.getAddress());
  await genesisDistributor.waitForDeployment();
  await nft.setGenesisRewardDistributor(await genesisDistributor.getAddress());

  await nft.setGenesisMinter(await deployer.getAddress(), true);
  await nara.mint(await deployer.getAddress(), 10n ** 24n);
  await nara.approve(await nft.getAddress(), 10n ** 24n);

  // Mint Token 3 (Eternal Genesis)
  await nft.mintGenesisAndLockFor(
    await deployer.getAddress(),
    10000n * 10n ** 18n,
    0,
    0,
    2, // round
    4, // tier
    50000, // multiplier
    true, // eternal
    { value: LOCK_FEE }
  );

  const svg = await renderer.tokenSVG(await nft.getAddress(), 1);
  fs.writeFileSync("svg_debug.txt", svg);
  console.log("SVG written to svg_debug.txt");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
