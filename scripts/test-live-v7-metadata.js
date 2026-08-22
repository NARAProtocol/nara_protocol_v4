import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const POSITION_NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const nft = new ethers.Contract(
    POSITION_NFT,
    [
      "function tokenURI(uint256 tokenId) view returns (string)",
      "function tokenSVG(uint256 tokenId) view returns (string)"
    ],
    provider
  );

  console.log("==================================================================");
  console.log("🔍 TESTING LIVE ON-CHAIN V7 METADATA ON BASE MAINNET");
  console.log("==================================================================");

  for (const tid of [1n, 2n]) {
    const uri = await nft.tokenURI(tid);
    const jsonStr = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
    const parsed = JSON.parse(jsonStr);
    console.log(`\n--- TOKEN #${tid} ---`);
    console.log("Name:       ", parsed.name);
    console.log("Description:", parsed.description.substring(0, 80) + "...");
    console.log("Attributes:");
    for (const a of parsed.attributes) {
      console.log(`  • ${a.trait_type}: ${a.value}`);
    }
  }
}

main().catch(console.error);
