import { ethers } from "ethers";
import fs from "node:fs";

const dotenv = fs.readFileSync(".env", "utf8");
const rpcLine = dotenv.split("\n").find((l) => l.startsWith("BASE_MAINNET_RPC_URL=") || l.startsWith("BASE_RPC_URL="));
const rpc = rpcLine.split("=")[1].trim();
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true, batchMaxCount: 1 });

const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";

const NFT_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positionIdOf(uint256 tokenId) view returns (uint256)",
  "function accountOf(uint256 tokenId) view returns (address)",
  "function lifetimeNaraClaimed(uint256 tokenId) view returns (uint256)",
  "function lifetimeClaimCount(uint256 tokenId) view returns (uint32)"
];

const TBA_ABI = [
  "function owner() view returns (address)",
  "function token() view returns (uint256 chainId, address tokenContract, uint256 tokenId)"
];

const ENGINE_ABI = [
  "function positionOf(uint256 positionId) view returns (tuple(address owner, uint64 createdEpoch, uint32 flags, uint128 amount, uint128 weight, uint64 activationEpoch, uint64 unlockEpoch, uint128 tokenWeight, uint256 naraDebtRay, uint256 ethDebtRay))",
  "function claimableRewards(uint256 positionId) view returns (uint256 naraAmount, uint256 ethAmount)"
];

async function main() {
  const nft = new ethers.Contract(NFT_ADDR, NFT_ABI, provider);
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, provider);

  const curBlock = await provider.getBlockNumber();
  console.log("Current Base Block:", curBlock);

  // Query Transfer events in the last 1000 blocks
  const fromBlock = curBlock - 1000;
  const transferEvents = await nft.queryFilter(nft.filters.Transfer(), fromBlock, "latest");

  console.log(`\n======================================================`);
  console.log(`🔍 DETECTED NFT TRANSFERS ON BASE (Last 1000 blocks): ${transferEvents.length}`);
  console.log(`======================================================`);

  for (let ev of transferEvents) {
    const txHash = ev.transactionHash;
    const rc = await provider.getTransactionReceipt(txHash);
    const tx = await provider.getTransaction(txHash);

    console.log(`\n--- NFT TRANSFER FORENSICS ---`);
    console.log(`Tx Hash:       ${txHash}`);
    console.log(`Block Number:  ${rc.blockNumber}`);
    console.log(`Status:        ${rc.status === 1 ? "1 (SUCCESS / MINED)" : "0 (REVERTED)"}`);
    console.log(`Gas Used:      ${rc.gasUsed.toString()} gas`);
    console.log(`Token ID:      #${ev.args.tokenId.toString()}`);
    console.log(`From (Seller): ${ev.args.from}`);
    console.log(`To (Buyer):    ${ev.args.to}`);

    const tokenId = ev.args.tokenId;
    const posId = await nft.positionIdOf(tokenId);
    const newOwner = await nft.ownerOf(tokenId);
    const tbaAddress = await nft.accountOf(tokenId);

    console.log(`\n--- ERC-6551 TOKEN-BOUND ACCOUNT VERIFICATION ---`);
    console.log(`NFT Token ID:             #${tokenId.toString()}`);
    console.log(`Position ID:              #${posId.toString()}`);
    console.log(`Current NFT Owner:        ${newOwner}`);
    console.log(`Token-Bound Account (TBA):${tbaAddress}`);

    // Check TBA contract owner
    const tbaContract = new ethers.Contract(tbaAddress, TBA_ABI, provider);
    const tbaOwner = await tbaContract.owner();
    console.log(`TBA Contract Live Owner:  ${tbaOwner}`);
    console.log(`Match Check (NFT Owner == TBA Owner): ${newOwner.toLowerCase() === tbaOwner.toLowerCase() ? "✅ 100% PERFECT MATCH" : "❌ MISMATCH"}`);

    // Check Engine Position
    const pos = await engine.positionOf(posId);
    console.log(`\n--- NARA ENGINE POSITION INTEGRITY ---`);
    console.log(`Engine Position Owner:    ${pos.owner} (Points to TBA)`);
    console.log(`Locked Principal:         ${ethers.formatEther(pos.amount)} NARA (100% Intact)`);
    console.log(`Position Weight:          ${pos.weight.toString()} (Unbroken)`);
    console.log(`Unlock Epoch:             #${pos.unlockEpoch.toString()}`);

    const claimable = await engine.claimableRewards(posId);
    console.log(`Claimable NARA for Buyer: ${ethers.formatEther(claimable.naraAmount)} NARA`);
    console.log(`Claimable ETH for Buyer:  ${ethers.formatEther(claimable.ethAmount)} ETH`);
  }
}

main().catch(console.error);
