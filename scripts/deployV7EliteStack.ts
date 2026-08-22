import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("💎 COMPLETING TOP 1% ELITE GENERATIVE V7 DEPLOYMENT ON BASE");
  console.log("==================================================================");
  console.log("Deployer Address:", deployer.address);

  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const SECURITY_PRINT_V2 = "0x88F69C994FE22dB6d31682604DAC29948c7C3728";
  const GENESIS_PLATE_V2 = "0xe072A5bf40072dB1D8af12c8D21B1b6A98e16E65";
  const METADATA_V3 = "0x54Dfb263Da94A8A3b60a96bf034BF16AA51a8825";
  const CORE_PLATE_V3 = "0x2E45aa12bC7b144538a76145dDaF3f2838Cf3BCB";

  console.log("Reusing NARAArtGenesisPlateV2:", GENESIS_PLATE_V2);
  console.log("Reusing NARAArtMetadataV3:    ", METADATA_V3);
  console.log("Reusing NARAArtCorePlateV3:   ", CORE_PLATE_V3);

  // 4. Deploy NARAPositionRendererV7
  console.log("\n[4/4] Deploying NARAPositionRendererV7...");
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

  // 5. Update Position NFT Renderer
  console.log("\nActivating V7 Renderer on NARAPositionNFTV4...");
  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT_ADDR, deployer);
  const tx = await nft.setRenderer(rendererV7Addr);
  await tx.wait();
  console.log("🎉 Live Renderer Upgraded to V7 Elite Generative Engine on Base Mainnet!");

  console.log("\n==================================================================");
  console.log("🎉 TOP 1% ELITE V7 STACK ACTIVE ON BASE MAINNET");
  console.log("==================================================================");
  console.log("NARAArtMetadataV3:     ", METADATA_V3);
  console.log("NARAArtCorePlateV3:    ", CORE_PLATE_V3);
  console.log("NARAPositionRendererV7:", rendererV7Addr);
  console.log("NARAPositionNFTV4:     ", POSITION_NFT_ADDR);
  console.log("==================================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
