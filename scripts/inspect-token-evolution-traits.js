import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const iface = [
    "function tokenURI(uint256 tokenId) view returns (string)"
  ];
  const nft = new ethers.Contract(NFT, iface, provider);

  const uri = await nft.tokenURI(2);
  const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
  console.log("==================================================================");
  console.log("🎴 TOKEN #2 LIVE METADATA & MULTI-VECTOR TRAITS ON BASE MAINNET");
  console.log("==================================================================");
  console.log("Name:", json.name);
  console.log("Description:", json.description);
  console.log("\nAttributes:");
  for (const a of json.attributes) {
    console.log(`  • ${a.trait_type.padEnd(28)}: ${a.value}`);
  }
}

main().catch(console.error);
