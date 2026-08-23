import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT_V5 = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
  const NFT_V6 = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";

  const abi = [
    "function owner() view returns (address)",
    "function renderer() view returns (address)",
    "function rendererFrozen() view returns (bool)"
  ];

  const nft5 = new ethers.Contract(NFT_V5, abi, provider);
  const nft6 = new ethers.Contract(NFT_V6, abi, provider);

  console.log("V5 (0xCcBD):");
  console.log("  Owner:", await nft5.owner());
  console.log("  Renderer:", await nft5.renderer());
  console.log("  Renderer Frozen:", await nft5.rendererFrozen());

  console.log("\nV6 (0x01D3):");
  console.log("  Owner:", await nft6.owner());
  console.log("  Renderer:", await nft6.renderer());
  console.log("  Renderer Frozen:", await nft6.rendererFrozen());
}

main().catch(console.error);
