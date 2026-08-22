import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const RENDERER = "0x04F24B5da51F5ee3e999Be72d4dc0aFE7bb31cf5";
  const NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";

  console.log("==================================================================");
  console.log("🔍 DEBUGGING EXACT REVERT IN RENDERER 0x04F2...");
  console.log("==================================================================");

  const iface = new ethers.Interface([
    "function tokenURI(address positionNft, uint256 tokenId) view returns (string)",
    "function tokenSVG(address positionNft, uint256 tokenId) view returns (string)",
    "function tokenJSON(address positionNft, uint256 tokenId) view returns (string)",
    "function METADATA() view returns (address)",
    "function CORE_PLATE() view returns (address)",
    "function GENESIS_PLATE() view returns (address)"
  ]);

  const renderer = new ethers.Contract(RENDERER, iface, provider);
  const metaAddr = await renderer.METADATA();
  const coreAddr = await renderer.CORE_PLATE();
  const genAddr = await renderer.GENESIS_PLATE();

  console.log("METADATA:", metaAddr);
  console.log("CORE_PLATE:", coreAddr);
  console.log("GENESIS_PLATE:", genAddr);

  try {
    const svg = await renderer.tokenSVG(NFT, 2);
    console.log("✅ tokenSVG succeeded! Length:", svg.length);
  } catch (e) {
    console.error("❌ tokenSVG failed:", e);
  }

  try {
    const json = await renderer.tokenJSON(NFT, 2);
    console.log("✅ tokenJSON succeeded! Length:", json.length);
  } catch (e) {
    console.error("❌ tokenJSON failed:", e);
  }
}

main().catch(console.error);
