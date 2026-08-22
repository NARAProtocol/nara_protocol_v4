import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  const POSITION_NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const RENDERER_V7 = "0x03AeA99BF3C2ce84B64dE7163aD98D3F3C422038";

  console.log("Setting renderer on Base Mainnet...");
  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT, deployer);
  const tx = await nft.setRenderer(RENDERER_V7);
  console.log("Tx broadcast:", tx.hash);
  await tx.wait();
  console.log("🎉 Renderer successfully updated to V7 (0x03Ae...)!");

  const currentRenderer = await nft.renderer();
  console.log("Active Live Renderer on NFT:", currentRenderer);
}

main().catch(console.error);
