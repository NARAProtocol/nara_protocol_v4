import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Minting first Position NFT on V6 stack with:", deployer.address);

  const NARA_ADDR = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";

  const nara = await ethers.getContractAt("NARAToken", NARA_ADDR, deployer);
  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT_ADDR, deployer);
  const engine = await ethers.getContractAt("NARAEngine", ENGINE_ADDR, deployer);

  const lockFee = await engine.lockFeeWei();
  console.log("Live Engine Lock Fee:", lockFee.toString(), "wei (", ethers.formatEther(lockFee), "ETH)");

  const amount = ethers.parseEther("10"); // 10 NARA
  const epochs = 96; // 1 day lock

  console.log("1. Approving 10 NARA to Position NFT contract...");
  const txApprove = await nara.approve(POSITION_NFT_ADDR, amount);
  await txApprove.wait();
  console.log("✅ Approved!");

  console.log("2. Calling mintAndLock(10 NARA, 96 epochs) with exact fee...");
  const txMint = await nft.mintAndLock(amount, epochs, 0, { value: lockFee });
  const rc = await txMint.wait();
  console.log("✅ Minted! Tx Hash:", rc.hash);

  console.log("\n3. Querying on-chain tokenURI(1)...");
  const uri = await nft.tokenURI(1);
  const jsonStr = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
  const metadata = JSON.parse(jsonStr);

  console.log("\n=======================================================");
  console.log("🏛️ LIVE ON-CHAIN METADATA FOR TOKEN #1 (V6 PRODUCTION)");
  console.log("=======================================================");
  console.log("Name:       ", metadata.name);
  console.log("Description:", metadata.description);
  console.log("Attributes: \n", JSON.stringify(metadata.attributes, null, 2));

  const svg = Buffer.from(metadata.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
  fs.writeFileSync("live_v6_token1_onchain.svg", svg, "utf8");
  console.log("\n✅ Saved live on-chain SVG to live_v6_token1_onchain.svg (Length:", svg.length, ")");
}

main().catch(console.error);
