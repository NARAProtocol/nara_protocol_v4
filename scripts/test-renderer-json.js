import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const RENDERER = "0x306f025430f3bd524953BF280e2300D5981A858f";
  const NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";

  const iface = [
    "function tokenJSON(address positionNft, uint256 tokenId) view returns (string)",
    "function tokenSVG(address positionNft, uint256 tokenId) view returns (string)"
  ];

  const renderer = new ethers.Contract(RENDERER, iface, provider);
  const jsonStr = await renderer.tokenJSON(NFT, 2);
  console.log("Raw JSON string for Token #2:\n", jsonStr);
}

main().catch(console.error);
