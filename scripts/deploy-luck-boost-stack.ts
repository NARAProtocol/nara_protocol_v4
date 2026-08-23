import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("🚀 COMPLETING LOCK-DURATION LUCK BOOST DEPLOYMENT ON BASE");
  console.log("==================================================================");
  console.log("Deployer:", deployer.address);

  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const GENESIS_PLATE_V2 = "0xe072A5bf40072dB1D8af12c8D21B1b6A98e16E65";
  const SECURITY_PRINT_V2 = "0x88F69C994FE22dB6d31682604DAC29948c7C3728";
  const METADATA_V3 = "0xC8f1d3037290729671c06e019ef653cf98509067";
  const CORE_PLATE_V3 = "0x317d11816F1ddd3ff1B35f99e5Ea2C39175DC2c5";

  console.log("Reusing NARAArtMetadataV3: ", METADATA_V3);
  console.log("Reusing NARAArtCorePlateV3:", CORE_PLATE_V3);

  // 3. Deploy NARAPositionRendererV7
  console.log("\n[3/3] Deploying NARAPositionRendererV7...");
  const RendererFactory = await ethers.getContractFactory("NARAPositionRendererV7", deployer);
  const rendererV7 = await RendererFactory.deploy(
    METADATA_V3,
    CORE_PLATE_V3,
    GENESIS_PLATE_V2,
    SECURITY_PRINT_V2
  );
  await rendererV7.waitForDeployment();
  const rendererV7Addr = await rendererV7.getAddress();
  console.log("✅ NARAPositionRendererV7:", rendererV7Addr);

  // 4. Update Position NFT Renderer
  console.log("\n[4/4] Activating V7 Renderer on NARAPositionNFTV4...");
  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT_ADDR, deployer);
  const tx = await nft.setRenderer(rendererV7Addr);
  await tx.wait();
  console.log("🎉 Live Renderer Upgraded to V7 with Lock-Duration Luck Boost on Base Mainnet!");

  console.log("\n==================================================================");
  console.log("🎯 NEW PRODUCTION STACK ACTIVE ON BASE MAINNET");
  console.log("==================================================================");
  console.log("NARAArtMetadataV3:     ", METADATA_V3);
  console.log("NARAArtCorePlateV3:    ", CORE_PLATE_V3);
  console.log("NARAPositionRendererV7:", rendererV7Addr);
  console.log("NARAPositionNFTV4:     ", POSITION_NFT_ADDR);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
