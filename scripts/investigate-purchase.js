import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT_V6 = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const NFT_V5 = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
  const ENGINE = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";

  console.log("==================================================================");
  console.log("🔍 DEEP DIVE FORENSICS: INVESTIGATING RECENT POSITION NFT PURCHASE");
  console.log("==================================================================");

  const nftAbi = [
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function accountOf(uint256 tokenId) view returns (address)",
    "function positionIdOf(uint256 tokenId) view returns (uint256)",
    "function positionInfo(uint256 tokenId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))",
    "function lifetimeEthClaimed(uint256 tokenId) view returns (uint256)",
    "function lifetimeNaraClaimed(uint256 tokenId) view returns (uint256)"
  ];

  const currentBlock = await provider.getBlockNumber();
  console.log("Current Base Block Height:", currentBlock);

  // Check V6 Contract
  const nftV6Contract = new ethers.Contract(NFT_V6, nftAbi, provider);
  console.log("\n--- Checking V6 Contract (0x01D3...) ---");
  const v6Events = await nftV6Contract.queryFilter(nftV6Contract.filters.Transfer(), currentBlock - 500, currentBlock);
  console.log("Recent Transfers on V6:", v6Events.length);
  for (const ev of v6Events) {
    console.log(`- Tx: ${ev.transactionHash} | Token #${ev.args[2]} | From: ${ev.args[0]} -> To: ${ev.args[1]}`);
  }

  // Check V5 Contract
  const nftV5Contract = new ethers.Contract(NFT_V5, nftAbi, provider);
  console.log("\n--- Checking V5 Contract (0xCcBD...) ---");
  const v5Events = await nftV5Contract.queryFilter(nftV5Contract.filters.Transfer(), currentBlock - 500, currentBlock);
  console.log("Recent Transfers on V5:", v5Events.length);
  for (const ev of v5Events) {
    console.log(`- Tx: ${ev.transactionHash} | Token #${ev.args[2]} | From: ${ev.args[0]} -> To: ${ev.args[1]}`);
  }

  // Find the latest transfer event across both
  const allEvents = [...v6Events, ...v5Events];
  if (allEvents.length === 0) {
    console.log("No transfers found in the last 500 blocks. Expanding search to 2,000 blocks...");
    const v6Long = await nftV6Contract.queryFilter(nftV6Contract.filters.Transfer(), currentBlock - 2000, currentBlock);
    const v5Long = await nftV5Contract.queryFilter(nftV5Contract.filters.Transfer(), currentBlock - 2000, currentBlock);
    for (const ev of [...v6Long, ...v5Long]) {
      console.log(`- Tx: ${ev.transactionHash} | Token #${ev.args[2]} | From: ${ev.args[0]} -> To: ${ev.args[1]}`);
    }
  }
}

main().catch(console.error);
