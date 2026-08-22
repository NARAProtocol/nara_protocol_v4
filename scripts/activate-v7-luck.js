import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const RENDERER_V7 = "0xDE0D4442f7cFEF38b3DE2fd03A9EbB32fD28F797";

  console.log("Activating V7 Luck Boost Renderer on NARAPositionNFTV4...");
  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT_ADDR, deployer);
  const tx = await nft.setRenderer(RENDERER_V7);
  console.log("Tx broadcast:", tx.hash);
  await tx.wait();
  console.log("🎉 Live Renderer Upgraded to V7 with Lock-Duration Luck Boost!");

  const active = await nft.renderer();
  console.log("Active Live Renderer on NFT:", active);
}

main().catch(console.error);
