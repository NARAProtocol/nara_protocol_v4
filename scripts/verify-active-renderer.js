import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT_CONTRACT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const iface = [
    "function renderer() view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function positionInfo(uint256 tokenId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))"
  ];
  const nft = new ethers.Contract(NFT_CONTRACT, iface, provider);
  const currentRenderer = await nft.renderer();
  console.log("==================================================================");
  console.log("🔍 ACTIVE RENDERER ON 0x01D3...:", currentRenderer);
  console.log("==================================================================");

  for (const tid of [1, 2, 4, 5, 6]) {
    const uri = await nft.tokenURI(tid);
    const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
    const pos = await nft.positionInfo(tid);
    console.log(`\n🎴 Token #${tid} | Amount: ${ethers.formatEther(pos.amount)} NARA | Created: ${pos.createdEpoch} | Unlock: ${pos.unlockEpoch}`);
    console.log(`  Name: ${json.name}`);
    for (const a of json.attributes) {
      console.log(`  • ${a.trait_type}: ${a.value}`);
    }
  }
}

main().catch(console.error);
