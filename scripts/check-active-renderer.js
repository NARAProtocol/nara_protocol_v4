import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const POSITION_NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const nft = new ethers.Contract(POSITION_NFT, ["function renderer() view returns (address)"], provider);

  const active = await nft.renderer();
  console.log("Current Active Renderer on Base Mainnet:", active);
}

main().catch(console.error);
