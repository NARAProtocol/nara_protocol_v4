import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const POSITION_NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const nft = new ethers.Contract(
    POSITION_NFT,
    [
      "function nextTokenId() view returns (uint256)",
      "function tokenURI(uint256 tokenId) view returns (string)",
      "function positionIdOf(uint256 tokenId) view returns (uint256)"
    ],
    provider
  );

  const nextId = await nft.nextTokenId();
  console.log("Total Tokens Minted:", nextId - 1n);

  for (let i = 1n; i < nextId; i++) {
    const uri = await nft.tokenURI(i);
    const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
    const posId = await nft.positionIdOf(i);
    console.log(`\n==================================================================`);
    console.log(`🎴 TOKEN #${i} (Position #${posId})`);
    console.log(`==================================================================`);
    console.log("Name:       ", json.name);
    for (const a of json.attributes) {
      if (["Chassis Finish", "Core Sigil Array", "Yield Status", "Genesis Reward Multiplier Bps"].includes(a.trait_type)) {
        console.log(`  • ${a.trait_type}: ${a.value}`);
      }
    }
  }
}

main().catch(console.error);
