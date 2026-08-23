import { ethers } from "ethers";
import fs from "node:fs";

const dotenv = fs.readFileSync(".env", "utf8");
const rpcLine = dotenv.split("\n").find((l) => l.startsWith("BASE_MAINNET_RPC_URL=") || l.startsWith("BASE_RPC_URL="));
const rpc = rpcLine.split("=")[1].trim();
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true, batchMaxCount: 1 });

const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
const ENGINE_ABI = [
  "function currentEpoch() view returns (uint64)",
  "function claimableRewards(uint256 positionId) view returns (uint256 ethAmount, uint256 naraAmount)",
  "function positionOf(uint256 positionId) view returns (tuple(address owner, uint64 createdEpoch, uint32 flags, uint128 amount, uint128 weight, uint64 activationEpoch, uint64 unlockEpoch, uint128 tokenWeight, uint256 naraDebtRay, uint256 ethDebtRay))",
  "function epochState() view returns (tuple(uint64 epoch, uint64 timestamp, uint256 circulatingSupply, uint256 totalLocked, uint256 activeTotalWeight, uint256 weightedLockShareWad, uint256 stressWad, uint256 betaWad, uint256 horizon, uint256 retentionWad, uint256 baseEmission, uint256 emission, uint256 admittedSupply, uint256 distributedNara, uint256 distributedEth, uint256 treasuryAmount, uint256 warmupFactorWad, uint256 bootstrapWeight, uint256 heartbeat))"
];

async function main() {
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, provider);
  const curEpoch = await engine.currentEpoch();
  const state = await engine.epochState();
  console.log("=== LIVE ON-CHAIN NARA ENGINE STATE ===");
  console.log("Current Epoch:", curEpoch.toString());
  console.log("Emission this epoch:", ethers.formatEther(state.emission), "NARA");
  console.log("Cumulative Distributed NARA:", ethers.formatEther(state.distributedNara), "NARA");
  console.log("Cumulative Distributed ETH: ", ethers.formatEther(state.distributedEth), "ETH");

  for (let posId of [11, 12, 13, 14]) {
    const pos = await engine.positionOf(posId);
    const rewards = await engine.claimableRewards(posId);
    console.log(`\n--- POSITION #${posId} (NFT Token #${posId - 10}) ---`);
    console.log("  Locked Principal: ", ethers.formatEther(pos.amount), "NARA");
    console.log("  Created Epoch:    ", pos.createdEpoch.toString());
    console.log("  Activation Epoch: ", pos.activationEpoch.toString());
    console.log("  Unlock Epoch:     ", pos.unlockEpoch.toString());
    console.log("  Claimable ETH:    ", ethers.formatEther(rewards.ethAmount), "ETH (" + rewards.ethAmount.toString() + " wei)");
    console.log("  Claimable NARA:   ", ethers.formatEther(rewards.naraAmount), "NARA (" + rewards.naraAmount.toString() + " wei)");
  }
}

main().catch(console.error);
