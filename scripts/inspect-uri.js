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

  const uri = await nft.tokenURI(1n);
  console.log("URI Prefix:", uri.substring(0, 50));
  if (uri.startsWith("data:application/json;base64,")) {
    const raw = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
    console.log("Decoded JSON length:", raw.length);
    console.log("Decoded snippet:", raw.substring(0, 300));
  } else {
    console.log("Raw URI snippet:", uri.substring(0, 300));
  }
}

main().catch(console.error);
