import { ethers } from "ethers";
import fs from "node:fs";

const dotenv = fs.readFileSync(".env", "utf8");
const rpcLine = dotenv.split("\n").find((l) => l.startsWith("BASE_MAINNET_RPC_URL=") || l.startsWith("BASE_RPC_URL="));
const rpc = rpcLine.split("=")[1].trim();
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true, batchMaxCount: 1 });

const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
const NARA_ADDR = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";

const NFT_ABI = [
  "event PositionRewardsClaimed(uint256 indexed tokenId, uint256 indexed positionId, address indexed to, uint256 naraAmount, uint256 ethAmount)",
  "event MetadataUpdate(uint256 _tokenId)",
  "function lifetimeNaraClaimed(uint256 tokenId) view returns (uint256)",
  "function lifetimeEthClaimed(uint256 tokenId) view returns (uint256)",
  "function lifetimeClaimCount(uint256 tokenId) view returns (uint32)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positionIdOf(uint256 tokenId) view returns (uint256)",
  "function accountOf(uint256 tokenId) view returns (address)"
];

const ENGINE_ABI = [
  "event RewardsClaimed(uint256 indexed positionId, address indexed to, uint256 naraAmount, uint256 ethAmount)",
  "function currentEpoch() view returns (uint64)",
  "function claimableRewards(uint256 positionId) view returns (uint256 naraAmount, uint256 ethAmount)",
  "function positionOf(uint256 positionId) view returns (tuple(address owner, uint64 createdEpoch, uint32 flags, uint128 amount, uint128 weight, uint64 activationEpoch, uint64 unlockEpoch, uint128 tokenWeight, uint256 naraDebtRay, uint256 ethDebtRay))",
  "function naraIndexRay() view returns (uint256)",
  "function ethIndexRay() view returns (uint256)"
];

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address account) view returns (uint256)"
];

async function main() {
  const nft = new ethers.Contract(NFT_ADDR, NFT_ABI, provider);
  const engine = new ethers.Contract(ENGINE_ADDR, ENGINE_ABI, provider);
  const naraToken = new ethers.Contract(NARA_ADDR, ERC20_ABI, provider);

  const curBlock = await provider.getBlockNumber();
  console.log("Current Base Block:", curBlock);

  // Search for PositionRewardsClaimed in the last 2000 blocks
  const fromBlock = curBlock - 2000;
  const claimEvents = await nft.queryFilter(nft.filters.PositionRewardsClaimed(), fromBlock, "latest");

  console.log(`\n======================================================`);
  console.log(`🔍 DETECTED CLAIM EVENTS ON BASE (Last 2000 blocks): ${claimEvents.length}`);
  console.log(`======================================================`);

  for (let ev of claimEvents) {
    const txHash = ev.transactionHash;
    const rc = await provider.getTransactionReceipt(txHash);
    const tx = await provider.getTransaction(txHash);

    console.log(`\n--- TRANSACTION FORENSICS ---`);
    console.log(`Tx Hash:       ${txHash}`);
    console.log(`Block Number:  ${rc.blockNumber}`);
    console.log(`Status:        ${rc.status === 1 ? "1 (SUCCESS / MINED)" : "0 (REVERTED)"}`);
    console.log(`Gas Used:      ${rc.gasUsed.toString()} gas`);
    console.log(`Caller:        ${tx.from}`);
    console.log(`Target:        ${tx.to}`);
    console.log(`Token ID:      #${ev.args.tokenId.toString()}`);
    console.log(`Position ID:   #${ev.args.positionId.toString()}`);
    console.log(`Recipient:     ${ev.args.to}`);
    console.log(`NARA Claimed:  ${ethers.formatEther(ev.args.naraAmount)} NARA (${ev.args.naraAmount.toString()} wei)`);
    console.log(`ETH Claimed:   ${ethers.formatEther(ev.args.ethAmount)} ETH (${ev.args.ethAmount.toString()} wei)`);

    // Verify ERC-20 Transfer logs in receipt
    const ifaceErc20 = new ethers.Interface(ERC20_ABI);
    const transfers = rc.logs
      .filter((l) => l.address.toLowerCase() === NARA_ADDR.toLowerCase())
      .map((l) => {
        try {
          return ifaceErc20.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    console.log(`\n--- ERC-20 NARA TRANSFERS IN RECEIPT (${transfers.length}) ---`);
    for (let t of transfers) {
      console.log(`  Transfer from ${t.args.from} to ${t.args.to}: ${ethers.formatEther(t.args.value)} NARA`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 LIVE STATE AUDIT FOR ALL POSITION TOKENS`);
  console.log(`======================================================`);

  for (let tokenId of [1, 2, 3, 4]) {
    const posId = await nft.positionIdOf(tokenId);
    const owner = await nft.ownerOf(tokenId);
    const account = await nft.accountOf(tokenId);
    const lifetimeNara = await nft.lifetimeNaraClaimed(tokenId);
    const lifetimeEth = await nft.lifetimeEthClaimed(tokenId);
    const claimCount = await nft.lifetimeClaimCount(tokenId);

    const pos = await engine.positionOf(posId);
    const claimable = await engine.claimableRewards(posId);
    const globalNaraIndex = await engine.naraIndexRay();

    console.log(`\nTOKEN #${tokenId} (Position #${posId}):`);
    console.log(`  Owner:                  ${owner}`);
    console.log(`  TBA Account:            ${account}`);
    console.log(`  Lifetime NARA Claimed:  ${ethers.formatEther(lifetimeNara)} NARA`);
    console.log(`  Lifetime ETH Claimed:   ${ethers.formatEther(lifetimeEth)} ETH`);
    console.log(`  Lifetime Claims Count:  ${claimCount.toString()} claims`);
    console.log(`  Position Amount:        ${ethers.formatEther(pos.amount)} NARA`);
    console.log(`  Position Weight:        ${pos.weight.toString()}`);
    console.log(`  Position naraDebtRay:   ${pos.naraDebtRay.toString()}`);
    console.log(`  Global naraIndexRay:    ${globalNaraIndex.toString()}`);
    console.log(`  Current Claimable NARA: ${ethers.formatEther(claimable.naraAmount)} NARA`);
    console.log(`  Current Claimable ETH:  ${ethers.formatEther(claimable.ethAmount)} ETH`);

    // Math Check: If claimed, debt must equal (weight * globalNaraIndex) / RAY
    if (claimCount > 0) {
      const RAY = 10n ** 27n;
      const expectedDebt = (BigInt(pos.weight) * BigInt(globalNaraIndex)) / RAY;
      const diff = expectedDebt > BigInt(pos.naraDebtRay) ? expectedDebt - BigInt(pos.naraDebtRay) : BigInt(pos.naraDebtRay) - expectedDebt;
      console.log(`  🧮 Debt Rebase Precision Match: ${diff === 0n ? "EXACT ZERO DELTA (100.000% PERFECT)" : "Delta: " + diff.toString() + " ray"}`);
    }
  }
}

main().catch(console.error);
