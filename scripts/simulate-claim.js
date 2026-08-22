import { ethers } from "ethers";
import fs from "node:fs";

const dotenv = fs.readFileSync(".env", "utf8");
const rpcLine = dotenv.split("\n").find((l) => l.startsWith("BASE_MAINNET_RPC_URL=") || l.startsWith("BASE_RPC_URL="));
const rpc = rpcLine.split("=")[1].trim();
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true, batchMaxCount: 1 });

const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
const NFT_ABI = [
  "function claimRewards(uint256 tokenId, address to) external returns (uint256 naraAmount, uint256 ethAmount)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positionIdOf(uint256 tokenId) view returns (uint256)",
  "function accountOf(uint256 tokenId) view returns (address)"
];

async function main() {
  const nft = new ethers.Contract(NFT_ADDR, NFT_ABI, provider);
  const owner3 = await nft.ownerOf(3);
  const owner4 = await nft.ownerOf(4);
  console.log("Token #3 Owner:", owner3);
  console.log("Token #4 Owner:", owner4);

  // Simulate callStatic for Token #3 with owner3 as recipient
  try {
    const res3 = await nft.claimRewards.staticCall(3, owner3, { from: owner3 });
    console.log("Token #3 Static Call SUCCESS! NARA Claimed:", ethers.formatEther(res3[0]), "NARA, ETH:", ethers.formatEther(res3[1]), "ETH");
  } catch (err) {
    console.error("Token #3 Static Call FAILED:", err.message);
  }

  // Simulate callStatic for Token #4 with owner4 as recipient
  try {
    const res4 = await nft.claimRewards.staticCall(4, owner4, { from: owner4 });
    console.log("Token #4 Static Call SUCCESS! NARA Claimed:", ethers.formatEther(res4[0]), "NARA, ETH:", ethers.formatEther(res4[1]), "ETH");
  } catch (err) {
    console.error("Token #4 Static Call FAILED:", err.message);
  }
}

main().catch(console.error);
