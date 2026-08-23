import { ethers } from "ethers";
import fs from "node:fs";

const dotenv = fs.readFileSync(".env", "utf8");
const rpcLine = dotenv.split("\n").find((l) => l.startsWith("BASE_MAINNET_RPC_URL=") || l.startsWith("BASE_RPC_URL="));
const rpc = rpcLine.split("=")[1].trim();
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true, batchMaxCount: 1 });

const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
const ENGINE_ABI = [
  "function currentEpoch() view returns (uint64)",
  "function positionOf(uint256 positionId) view returns (tuple(address owner, uint64 createdEpoch, uint32 flags, uint128 amount, uint128 weight, uint64 activationEpoch, uint64 unlockEpoch, uint128 tokenWeight, uint256 naraDebtRay, uint256 ethDebtRay))"
];
const NFT_ABI = [
  "function positionIdOf(uint256 tokenId) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)"
];

async function main() {
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, provider);
  const nft = new ethers.Contract(NFT_ADDR, NFT_ABI, provider);
  const curEpoch = await engine.currentEpoch();
  console.log("Current Live Epoch on Base:", curEpoch.toString());

  for (let id of [1, 2, 3, 4]) {
    const posId = await nft.positionIdOf(id);
    const owner = await nft.ownerOf(id);
    const pos = await engine.positionOf(posId);
    const isMatured = curEpoch >= pos.unlockEpoch;
    const remaining = isMatured ? 0n : pos.unlockEpoch - curEpoch;
    console.log(`Token #${id} (Pos #${posId}):`);
    console.log(`  Owner:        ${owner}`);
    console.log(`  Amount:       ${ethers.formatEther(pos.amount)} NARA`);
    console.log(`  Unlock Epoch: #${pos.unlockEpoch.toString()}`);
    console.log(`  Status:       ${isMatured ? "🔓 MATURED & UNLOCKABLE NOW" : "🔒 LOCKED (" + remaining.toString() + " epochs remaining ~" + (Number(remaining) * 15 / 60).toFixed(1) + " hours)"}`);
  }
}

main().catch(console.error);
