import hre from "hardhat";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("🚀 DEPLOYING 10-RANK MULTI-VECTOR EVOLUTION ENGINE ON BASE MAINNET");
  console.log("==================================================================");
  console.log("Deployer:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("ETH Balance:", ethers.formatEther(bal));

  const NFT_CONTRACT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const GENESIS_PLATE = "0x20520115546c28F99aE581d62935e62D9E8B9022";
  const SECURITY_PRINT = "0x88F69C994FE22dB6d31682604DAC29948c7C3728";

  // 1. Deploy CorePlateV3 (10 Ranks + Multi-Vector)
  console.log("\n📦 1. Deploying NARAArtCorePlateV3 (10-Rank Engine)...");
  const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV3");
  const corePlate = await CorePlate.deploy();
  await corePlate.waitForDeployment();
  const corePlateAddress = await corePlate.getAddress();
  console.log("✅ CorePlateV3:", corePlateAddress);

  console.log("Waiting 6 seconds for mempool...");
  await sleep(6000);

  // 2. Deploy MetadataV3
  console.log("\n📦 2. Deploying NARAArtMetadataV3 (10-Rank Telemetry)...");
  const Metadata = await ethers.getContractFactory("NARAArtMetadataV3");
  const metadata = await Metadata.deploy(corePlateAddress);
  await metadata.waitForDeployment();
  const metadataAddress = await metadata.getAddress();
  console.log("✅ MetadataV3:", metadataAddress);

  console.log("Waiting 6 seconds for mempool...");
  await sleep(6000);

  // 3. Deploy RendererV7
  console.log("\n📦 3. Deploying NARAPositionRendererV7...");
  const Renderer = await ethers.getContractFactory("NARAPositionRendererV7");
  const renderer = await Renderer.deploy(metadataAddress, corePlateAddress, GENESIS_PLATE, SECURITY_PRINT);
  await renderer.waitForDeployment();
  const rendererAddress = await renderer.getAddress();
  console.log("✅ RendererV7:", rendererAddress);

  console.log("Waiting 6 seconds for mempool...");
  await sleep(6000);

  // 4. Set Renderer on NFT Contract
  console.log("\n🔗 4. Activating on NARAPositionNFTV4 (0x01D3...)...");
  const nftAbi = [
    "function setRenderer(address newRenderer) external",
    "function renderer() view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function owner() view returns (address)"
  ];
  const nft = new ethers.Contract(NFT_CONTRACT, nftAbi, deployer);
  const tx = await nft.setRenderer(rendererAddress);
  console.log("Tx hash:", tx.hash);
  await tx.wait(1);
  console.log("✅ Activated!");

  // 5. Live Readback
  console.log("\n==================================================================");
  console.log("🎉 LIVE ON-CHAIN READBACK VERIFICATION:");
  console.log("==================================================================");
  for (const tid of [2, 4, 5, 6]) {
    const uri = await nft.tokenURI(tid);
    const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
    console.log(`\n🎴 Token #${tid}: ${json.name}`);
    for (const a of json.attributes) {
      console.log(`  • ${a.trait_type}: ${a.value}`);
    }
  }
}

main().catch(console.error);
