import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT_V6 = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const NFT_V5 = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";

  console.log("==================================================================");
  console.log("🔍 DEEP AUDIT: INSPECTING ALL TOKENS MINTED ON BASE MAINNET");
  console.log("==================================================================");

  const nftAbi = [
    "function nextTokenId() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function positionIdOf(uint256 tokenId) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function renderer() view returns (address)",
    "function positionInfo(uint256 tokenId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))"
  ];

  // 1. Inspect V6 (0x01D3...)
  const nftV6 = new ethers.Contract(NFT_V6, nftAbi, provider);
  const nextV6 = await nftV6.nextTokenId();
  const rendererV6 = await nftV6.renderer();
  console.log(`\n--- V6 CONTRACT (0x01D3...) [Renderer: ${rendererV6}] Total Minted: ${nextV6 - 1n} ---`);

  for (let i = 1n; i < nextV6; i++) {
    const owner = await nftV6.ownerOf(i);
    const posId = await nftV6.positionIdOf(i);
    const uri = await nftV6.tokenURI(i);
    const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
    const pos = await nftV6.positionInfo(i);
    const duration = pos.unlockEpoch > pos.createdEpoch ? (pos.unlockEpoch - pos.createdEpoch) : 0n;

    console.log(`\n🎴 V6 Token #${i} (Position #${posId})`);
    console.log(`  Owner:            ${owner}`);
    console.log(`  Principal:        ${ethers.formatEther(pos.amount)} NARA`);
    console.log(`  Created Epoch:    ${pos.createdEpoch} | Unlock Epoch: ${pos.unlockEpoch} | Duration: ${duration} epochs (${Number(duration) * 15 / 60 / 24} days)`);
    console.log(`  Title:            ${json.name}`);
    for (const a of json.attributes) {
      if (["Chassis Finish", "Lock Duration Boost", "Core Sigil Array", "Yield Status"].includes(a.trait_type)) {
        console.log(`  • ${a.trait_type}: ${a.value}`);
      }
    }
  }

  // 2. Inspect V5 (0xCcBD...)
  const nftV5 = new ethers.Contract(NFT_V5, nftAbi, provider);
  const nextV5 = await nftV5.nextTokenId();
  const rendererV5 = await nftV5.renderer();
  console.log(`\n--- V5 CONTRACT (0xCcBD...) [Renderer: ${rendererV5}] Total Minted: ${nextV5 - 1n} ---`);
  for (let i = 1n; i < nextV5; i++) {
    const owner = await nftV5.ownerOf(i);
    const posId = await nftV5.positionIdOf(i);
    const pos = await nftV5.positionInfo(i);
    const duration = pos.unlockEpoch > pos.createdEpoch ? (pos.unlockEpoch - pos.createdEpoch) : 0n;
    console.log(`- V5 Token #${i} (Pos #${posId}) | Owner: ${owner} | Amount: ${ethers.formatEther(pos.amount)} NARA | Duration: ${duration} epochs (${Number(duration) * 15 / 60 / 24} days)`);
  }
}

main().catch(console.error);
