import hre from "hardhat";
import { deployRenderer } from "../test/helpers/art";
import * as fs from "fs";
import * as path from "path";

const ONE = 10n ** 18n;
const LOCK_FEE = 10n ** 14n;
const UNLOCK_FEE = 2n * 10n ** 14n;

function wad(x: bigint | number): bigint {
  return BigInt(x) * ONE;
}

async function main() {
  const { ethers } = await (hre.network as any).connect();
  const [deployer, alice] = await ethers.getSigners();

  console.log("Deploying Mock Nara NFT system...");

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const nara = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const naraAddr = await nara.getAddress();

  const RewardToken = await ethers.getContractFactory("MockERC20", deployer);
  const usdc = await RewardToken.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(naraAddr);
  await engine.setUnlockFeeWei(UNLOCK_FEE);
  const engineAddr = await engine.getAddress();

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const accountImpl = await Account.deploy();
  await accountImpl.waitForDeployment();
  const accountImplAddr = await accountImpl.getAddress();

  const renderer = await deployRenderer(ethers, deployer);
  const rendererAddr = await renderer.getAddress();

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const nft = await NFT.deploy(
    engineAddr,
    naraAddr,
    accountImplAddr,
    rendererAddr,
    await deployer.getAddress(),
    await deployer.getAddress(),
    500
  );
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const genesisDistributor = await Distributor.deploy(nftAddr, await usdc.getAddress());
  await genesisDistributor.waitForDeployment();
  await nft.setGenesisRewardDistributor(await genesisDistributor.getAddress());

  // Setup balances
  await nara.mint(await deployer.getAddress(), wad(200_000));
  await nara.mint(await alice.getAddress(), wad(10_000));

  // Fund the engine with some ETH for claiming rewards
  await deployer.sendTransaction({
    to: engineAddr,
    value: ethers.parseEther("20")
  });

  console.log("Minting Sample NFTs...");
  const samples = [];

  // NFT 1: Standard position (Realized: New / Dormant / Standard Scar)
  const amount1 = wad(1200);
  await nara.connect(deployer).approve(nftAddr, amount1);
  await nft.connect(deployer).mintAndLock(amount1, 96, 0, { value: LOCK_FEE });
  const uri1 = await nft.tokenURI(1);
  samples.push({
    name: "Standard Position #1",
    description: "1200 NARA Locked for 96 Epochs (Dormant Core)",
    uri: uri1
  });

  // NFT 2: Genesis position (Simulate claims to reach Tier 2 - "Rewarded")
  const amount2 = wad(5000);
  await nft.setGenesisMinter(await deployer.getAddress(), true);
  await nara.connect(deployer).approve(nftAddr, amount2);
  await nft.connect(deployer).mintGenesisAndLockFor(
    await deployer.getAddress(),
    amount2,
    192,
    0,
    1, // round
    2, // tier
    25000, // multiplier
    false, // eternal
    { value: LOCK_FEE }
  );

  // Set claimable rewards on mock engine and perform claim to set lifetimeEthClaimed
  const claimEth2 = ethers.parseEther("0.15"); // Tier 2 threshold is 0.1 ETH
  await engine.setClaimable(2, 0, claimEth2);
  await nft.connect(deployer).claimRewards(2, await deployer.getAddress());

  const uri2 = await nft.tokenURI(2);
  samples.push({
    name: "Genesis Position #2",
    description: "5000 NARA Locked, Genesis Tier 2, Realized Tier: Rewarded (Medium Bloom)",
    uri: uri2
  });

  // NFT 3: Eternal Genesis (Simulate claims to reach Tier 4 - "Apex")
  const amount3 = wad(10000);
  await nara.connect(deployer).approve(nftAddr, amount3);
  await nft.connect(deployer).mintGenesisAndLockFor(
    await deployer.getAddress(),
    amount3,
    0, // duration (0 for eternal)
    0,
    2, // round
    4, // tier
    50000, // multiplier
    true, // eternal
    { value: LOCK_FEE }
  );

  // Set claimable rewards on mock engine to reach Tier 4 (10 ETH threshold)
  const claimEth3 = ethers.parseEther("12.5");
  await engine.setClaimable(3, 0, claimEth3);
  await nft.connect(deployer).claimRewards(3, await deployer.getAddress());

  const uri3 = await nft.tokenURI(3);
  samples.push({
    name: "Eternal Genesis Position #3",
    description: "10000 NARA Eternal lock, Genesis Tier 4, Realized Tier: Apex (Full Luminous Bloom)",
    uri: uri3
  });

  // NFT 4: Plate Error "Double Strike" (Brute-force a seed matching seed % 10000 == 777)
  console.log("Brute-forcing epoch for Plate Press Error (Double Strike)...");
  let epoch4 = 0;
  while (true) {
    const encoded = ethers.solidityPacked(["uint256", "uint256", "uint256"], [4, 4, BigInt(epoch4)]);
    const hash = ethers.keccak256(encoded);
    const seed = BigInt(hash);
    if (seed % 10000n === 777n) {
      break;
    }
    epoch4++;
  }
  await engine.setCurrentEpoch(epoch4);

  const amount4 = wad(1500);
  await nara.connect(deployer).approve(nftAddr, amount4);
  await nft.connect(deployer).mintAndLock(amount4, 48, 0, { value: LOCK_FEE });

  const uri4 = await nft.tokenURI(4);
  samples.push({
    name: "Plate Error #4: Double Strike",
    description: "1500 NARA Position with a rare 1-in-10,000 Plate Press Error (Offset Ink Watermark)",
    uri: uri4
  });

  // NFT 5: Plate Error "Golden Sigil" (Brute-force a seed matching seed % 100000 == 7777)
  console.log("Brute-forcing epoch for Golden Sigil...");
  let epoch5 = 0;
  while (true) {
    const encoded = ethers.solidityPacked(["uint256", "uint256", "uint256"], [5, 5, BigInt(epoch5)]);
    const hash = ethers.keccak256(encoded);
    const seed = BigInt(hash);
    if (seed % 100000n === 7777n) {
      break;
    }
    epoch5++;
  }
  await engine.setCurrentEpoch(epoch5);

  const amount5 = wad(2000);
  await nara.connect(deployer).approve(nftAddr, amount5);
  await nft.connect(deployer).mintAndLock(amount5, 24, 0, { value: LOCK_FEE });

  const uri5 = await nft.tokenURI(5);
  samples.push({
    name: "Plate Error #5: Golden Sigil",
    description: "2000 NARA Position with a rare 1-in-100,000 Plate Press Error (Golden N Sigil with hairline Ivory inline)",
    uri: uri5
  });

  // NFT 6: Plate Error "Clean Plate" (Brute-force a seed matching seed % 1000 == 123 for Void Scar)
  console.log("Brute-forcing epoch for Clean Plate (Void Scar)...");
  let epoch6 = 0;
  while (true) {
    const encoded = ethers.solidityPacked(["uint256", "uint256", "uint256"], [6, 6, BigInt(epoch6)]);
    const hash = ethers.keccak256(encoded);
    const seed = BigInt(hash);
    if (seed % 1000n === 123n) {
      break;
    }
    epoch6++;
  }
  await engine.setCurrentEpoch(epoch6);

  const amount6 = wad(3000);
  await nara.connect(deployer).approve(nftAddr, amount6);
  await nft.connect(deployer).mintAndLock(amount6, 72, 0, { value: LOCK_FEE });

  const uri6 = await nft.tokenURI(6);
  samples.push({
    name: "Plate Error #6: Clean Plate (Void)",
    description: "3000 NARA Position with a rare 1-in-1,000 plate mis-engraving error where there is no scar incision.",
    uri: uri6
  });

  // Write samples js
  const outputPath = path.join(process.cwd(), "../sample_nara_nfts.js");
  const jsContent = `// Pre-rendered sample NFTs for the viewer\nconst sampleNfts = ${JSON.stringify(samples, null, 2)};\n`;
  fs.writeFileSync(outputPath, jsContent);
  console.log(`Successfully generated and wrote sample NFTs to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
