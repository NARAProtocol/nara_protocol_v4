import hre from "hardhat";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("🚀 RESUMING GRAIL GATE V7 ART ENGINE DEPLOYMENT ON BASE MAINNET");
  console.log("==================================================================");

  const NFT_CONTRACT = ethers.getAddress("0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b");
  const GENESIS_PLATE = ethers.getAddress("0x5e8bb713a7feb6e2c7ae9d61e2eb256b8fa1f8d1");
  const SECURITY_PRINT = ethers.getAddress("0xd39d843b0d1eeb9b20ce47384d02a64c489c7c25");
  const corePlateAddress = ethers.getAddress("0x30C2cE155DF99B3aDE3D9d4C65DCB6b45Bb9202f");
  const metadataAddress = ethers.getAddress("0xf8b1Be3A22f5e6Bf69491fCCd4081aF71615F605");

  console.log("✅ CorePlate already deployed at:", corePlateAddress);
  console.log("✅ Metadata already deployed at:", metadataAddress);

  // 3. Deploy NARAPositionRendererV7
  console.log("\n📦 3. Deploying NARAPositionRendererV7...");
  const Renderer = await ethers.getContractFactory("NARAPositionRendererV7");
  const renderer = await Renderer.deploy(metadataAddress, corePlateAddress, GENESIS_PLATE, SECURITY_PRINT);
  await renderer.waitForDeployment();
  const rendererAddress = await renderer.getAddress();
  console.log("✅ NARAPositionRendererV7 Deployed at:", rendererAddress);

  console.log("Waiting 6 seconds for mempool...");
  await sleep(6000);

  // 4. Update NFT Renderer on 0x01D3...
  console.log("\n🔗 4. Activating Grail Gate Renderer on NARAPositionNFTV4 (0x01D3...)...");
  const nftAbi = [
    "function setRenderer(address newRenderer) external",
    "function renderer() view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function owner() view returns (address)"
  ];
  const nft = new ethers.Contract(NFT_CONTRACT, nftAbi, deployer);
  const tx = await nft.setRenderer(rendererAddress);
  console.log("Waiting for setRenderer tx:", tx.hash);
  await tx.wait(1);
  console.log("✅ Renderer Successfully Updated to:", rendererAddress);

  // 5. Verify live readback
  const liveRenderer = await nft.renderer();
  console.log("\n🎉 LIVE RENDERER VERIFIED ON-CHAIN:", liveRenderer);

  console.log("\n🔍 Verifying Token #2 URI (Eternal Genesis):");
  const uri2 = await nft.tokenURI(2);
  const json2 = JSON.parse(Buffer.from(uri2.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
  console.log("Name:", json2.name);
  console.log("Attributes:", json2.attributes.map((a: any) => `${a.trait_type}: ${a.value}`).join(" | "));

  console.log("\n🔍 Verifying Token #5 URI (10 NARA 1-Year Lock):");
  const uri5 = await nft.tokenURI(5);
  const json5 = JSON.parse(Buffer.from(uri5.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
  console.log("Name:", json5.name);
  console.log("Attributes:", json5.attributes.map((a: any) => `${a.trait_type}: ${a.value}`).join(" | "));
}

main().catch(console.error);
