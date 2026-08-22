import hre from "hardhat";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("🚀 DEPLOYING FINAL GRAIL GATE V7 METADATA & RENDERER ON BASE");
  console.log("==================================================================");

  const NFT_CONTRACT = ethers.getAddress("0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b");
  const GENESIS_PLATE = ethers.getAddress("0x5e8bb713a7feb6e2c7ae9d61e2eb256b8fa1f8d1");
  const SECURITY_PRINT = ethers.getAddress("0xd39d843b0d1eeb9b20ce47384d02a64c489c7c25");
  const corePlateAddress = ethers.getAddress("0x30C2cE155DF99B3aDE3D9d4C65DCB6b45Bb9202f");

  console.log("Deployer:", deployer.address);
  console.log("CorePlate:", corePlateAddress);

  // 1. Deploy NARAArtMetadataV3
  console.log("\n📦 1. Deploying NARAArtMetadataV3...");
  const Metadata = await ethers.getContractFactory("NARAArtMetadataV3");
  const metadata = await Metadata.deploy(corePlateAddress);
  await metadata.waitForDeployment();
  const metadataAddress = await metadata.getAddress();
  console.log("✅ NARAArtMetadataV3 Deployed at:", metadataAddress);

  console.log("Waiting 6 seconds...");
  await sleep(6000);

  // 2. Deploy NARAPositionRendererV7
  console.log("\n📦 2. Deploying NARAPositionRendererV7...");
  const Renderer = await ethers.getContractFactory("NARAPositionRendererV7");
  const renderer = await Renderer.deploy(metadataAddress, corePlateAddress, GENESIS_PLATE, SECURITY_PRINT);
  await renderer.waitForDeployment();
  const rendererAddress = await renderer.getAddress();
  console.log("✅ NARAPositionRendererV7 Deployed at:", rendererAddress);

  console.log("Waiting 6 seconds...");
  await sleep(6000);

  // 3. Set Renderer on NFT Contract
  console.log("\n🔗 3. Activating on NARAPositionNFTV4 (0x01D3...)...");
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

  // 4. Test Live Reads
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
