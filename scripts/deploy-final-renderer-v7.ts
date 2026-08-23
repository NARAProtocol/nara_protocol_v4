import hre from "hardhat";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("🚀 DEPLOYING FINAL GRAIL GATE RENDERER V7 WITH CORRECT PLATES");
  console.log("==================================================================");

  const NFT_CONTRACT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const GENESIS_PLATE = "0x20520115546c28F99aE581d62935e62D9E8B9022";
  const SECURITY_PRINT = "0x88F69C994FE22dB6d31682604DAC29948c7C3728";
  const CORE_PLATE = "0x30C2cE155DF99B3aDE3D9d4C65DCB6b45Bb9202f";
  const METADATA = "0x308c43a1D46F97EF9F62CCf025fd9655A5055D76";

  console.log("Deployer:       ", deployer.address);
  console.log("GENESIS_PLATE:  ", GENESIS_PLATE);
  console.log("SECURITY_PRINT: ", SECURITY_PRINT);
  console.log("CORE_PLATE:     ", CORE_PLATE);
  console.log("METADATA:       ", METADATA);

  // Deploy NARAPositionRendererV7
  console.log("\n📦 Deploying NARAPositionRendererV7...");
  const Renderer = await ethers.getContractFactory("NARAPositionRendererV7");
  const renderer = await Renderer.deploy(METADATA, CORE_PLATE, GENESIS_PLATE, SECURITY_PRINT);
  await renderer.waitForDeployment();
  const rendererAddress = await renderer.getAddress();
  console.log("✅ NARAPositionRendererV7 Deployed at:", rendererAddress);

  console.log("Waiting 6 seconds...");
  await sleep(6000);

  // Set Renderer on NFT Contract
  console.log("\n🔗 Activating on NARAPositionNFTV4 (0x01D3...)...");
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

  // Test Live Reads
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
