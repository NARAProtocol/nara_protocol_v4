import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const POSITION_NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const NARA_ADDR = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";

  console.log("==================================================================");
  console.log("🎲 MINTING NEW POSITION TO PULL FROM TOP 1% GENERATIVE ENGINE");
  console.log("==================================================================");

  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT, deployer);
  const nara = await ethers.getContractAt("NARAToken", NARA_ADDR, deployer);



  const lockAmount = ethers.parseEther("10"); // 10 NARA
  const durationEpochs = 96n; // 1 day

  const currentAllowance = await nara.allowance(deployer.address, POSITION_NFT);
  if (currentAllowance < lockAmount) {
    console.log("Approving 1000 NARA to Position NFT...");
    const appTx = await nara.approve(POSITION_NFT, ethers.parseEther("1000"));
    await appTx.wait();
  }


  const lockFee = 1000000000000n; // 0.000001 ETH
  console.log("Required Lock Fee:", ethers.formatEther(lockFee), "ETH");

  console.log("Minting & Locking Position on Base Mainnet...");
  const mintTx = await nft.mintAndLock(lockAmount, durationEpochs, 0n, { value: lockFee });


  console.log("Mint Tx Hash:", mintTx.hash);
  const receipt = await mintTx.wait();
  console.log("Minted in Block:", receipt.blockNumber);

  const nextTokenId = await nft.nextTokenId();
  const newTokenId = nextTokenId - 1n;
  console.log(`\n🎉 NEW TOKEN MINTED: #${newTokenId}`);

  // Query live metadata
  const uri = await nft.tokenURI(newTokenId);
  const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));

  console.log("\n==================================================================");
  console.log("🎴 COLLECTOR CARD REVEAL:");
  console.log("==================================================================");
  console.log("Title:       ", json.name);
  console.log("Traits Pulled:");
  for (const a of json.attributes) {
    console.log(`  • ${a.trait_type}: ${a.value}`);
  }
}

main().catch(console.error);
