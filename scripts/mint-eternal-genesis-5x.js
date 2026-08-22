import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Configuring & Minting Eternal Genesis 5x with:", deployer.address);

  const NARA_ADDR = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const RENDERER_ADDR = "0x2C537Ba4b637e06B4554FbA4b7f14dcEd6f70Cb9";
  const DISTRIBUTOR_ADDR = "0x1A6E7B52Db9738622b835059F8C0B2f146829EC8";

  console.log("Reusing NARAPositionRendererV6:       ", RENDERER_ADDR);
  console.log("Reusing NARAGenesisRewardDistributorV4:", DISTRIBUTOR_ADDR);

  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT_ADDR, deployer);

  // 1. Set Renderer
  console.log("\n1. Calling nft.setRenderer()...");
  const currentRenderer = await nft.renderer();
  if (currentRenderer.toLowerCase() !== RENDERER_ADDR.toLowerCase()) {
    const tx1 = await nft.setRenderer(RENDERER_ADDR);
    await tx1.wait();
    console.log("✅ Renderer updated!");
  } else {
    console.log("✅ Renderer already set!");
  }

  // 2. Set Genesis Reward Distributor
  console.log("\n2. Calling nft.setGenesisRewardDistributor()...");
  const currentDistributor = await nft.genesisRewardDistributor();
  if (currentDistributor.toLowerCase() !== DISTRIBUTOR_ADDR.toLowerCase()) {
    const tx2 = await nft.setGenesisRewardDistributor(DISTRIBUTOR_ADDR);
    await tx2.wait();
    console.log("✅ Genesis Distributor updated!");
  } else {
    console.log("✅ Genesis Distributor already set!");
  }

  // 3. Set Genesis Minter
  console.log("\n3. Calling nft.setGenesisMinter()...");
  const isMinter = await nft.genesisMinter(deployer.address);
  if (!isMinter) {
    const tx3 = await nft.setGenesisMinter(deployer.address, true);
    await tx3.wait();
    console.log("✅ Genesis Minter allowlisted!");
  } else {
    console.log("✅ Genesis Minter already allowlisted!");
  }

  // 4. Mint Eternal Genesis 5x Position
  console.log("\n4. Minting Eternal Genesis 5x Position (Round 1, Tier 1, 50,000 BPS)...");
  const nara = await ethers.getContractAt("NARAToken", NARA_ADDR, deployer);
  const amount = ethers.parseEther("10"); // 10 NARA
  const durationEpochs = 35040; // 1 Year / Eternal
  const roundId = 1;
  const tierId = 1;
  const multiplierBps = 50000; // 5.00x Boost
  const eternal = true;
  const lockFee = 1000000000000n; // 0.000001 ETH

  console.log("Approving NARA...");
  const txApprove = await nara.approve(POSITION_NFT_ADDR, amount);
  await txApprove.wait();

  console.log("Broadcasting mintGenesisAndLockFor transaction...");
  const txMint = await nft.mintGenesisAndLockFor(
    deployer.address,
    amount,
    durationEpochs,
    0,
    roundId,
    tierId,
    multiplierBps,
    eternal,
    { value: lockFee }
  );
  const rc = await txMint.wait();
  console.log("🎉 ETERNAL GENESIS MINTED! Tx:", rc.hash);

  // 5. Query and display Token #2 On-Chain Output
  console.log("\n5. Querying on-chain tokenURI(2)...");
  const uri = await nft.tokenURI(2);
  const jsonStr = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
  const metadata = JSON.parse(jsonStr);

  console.log("\n=======================================================");
  console.log("👑 ETERNAL GENESIS 5.0X ON-CHAIN METADATA (TOKEN #2)");
  console.log("=======================================================");
  console.log("Name:       ", metadata.name);
  console.log("Description:", metadata.description);
  console.log("Attributes: \n", JSON.stringify(metadata.attributes, null, 2));

  const svg = Buffer.from(metadata.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
  fs.writeFileSync("live_eternal_genesis_5x.svg", svg, "utf8");
  console.log("\n✅ Saved live SVG to live_eternal_genesis_5x.svg (Length:", svg.length, ")");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
