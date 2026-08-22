import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT_V6 = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const NFT_V5 = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";

  console.log("==================================================================");
  console.log("🔍 INVESTIGATING ALL RECENTLY MINTED TOKENS ON BASE MAINNET");
  console.log("==================================================================");

  const nftAbi = [
    "function nextTokenId() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function positionIdOf(uint256 tokenId) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function positionInfo(uint256 tokenId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))"
  ];

  // Inspect V6 Contract (0x01D3...)
  const nftV6 = new ethers.Contract(NFT_V6, nftAbi, provider);
  const nextV6 = await nftV6.nextTokenId();
  console.log(`\n--- V6 CONTRACT (0x01D3...) Total Minted: ${nextV6 - 1n} ---`);

  for (let i = 1n; i < nextV6; i++) {
    const owner = await nftV6.ownerOf(i);
    const posId = await nftV6.positionIdOf(i);
    const uri = await nftV6.tokenURI(i);
    const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
    const pos = await nftV6.positionInfo(i);

    console.log(`\n🎴 Token #${i} (Position #${posId})`);
    console.log(`  Owner:            ${owner}`);
    console.log(`  Principal:        ${ethers.formatEther(pos.amount)} NARA`);
    console.log(`  Created Epoch:    ${pos.createdEpoch}`);
    console.log(`  Title:            ${json.name}`);
    for (const a of json.attributes) {
      if (["Chassis Finish", "Core Sigil Array", "Yield Status", "Genesis Reward Multiplier Bps"].includes(a.trait_type)) {
        console.log(`  • ${a.trait_type}: ${a.value}`);
      }
    }
  }

  // Also check V5 Contract (0xCcBD...)
  const nftV5 = new ethers.Contract(NFT_V5, nftAbi, provider);
  const nextV5 = await nftV5.nextTokenId();
  console.log(`\n--- V5 CONTRACT (0xCcBD...) Total Minted: ${nextV5 - 1n} ---`);
  for (let i = 1n; i < nextV5; i++) {
    const owner = await nftV5.ownerOf(i);
    const posId = await nftV5.positionIdOf(i);
    const pos = await nftV5.positionInfo(i);
    console.log(`- Token #${i} (Pos #${posId}) | Owner: ${owner} | Amount: ${ethers.formatEther(pos.amount)} NARA`);
  }
}

main().catch(console.error);
