import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const TX_HASH = "0xd9eb9a557f718b8d634817d1670b9e78c3523a26038a02f82cdcdae56ae2c47b";

  console.log("==================================================================");
  console.log("🔍 FORENSIC AUDIT OF TRANSACTION:", TX_HASH);
  console.log("==================================================================");

  const tx = await provider.getTransaction(TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);

  console.log("Status:          ", receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED");
  console.log("Block Number:    ", receipt.blockNumber);
  console.log("From (Signer):   ", tx.from);
  console.log("To (Target):     ", tx.to);
  console.log("Value:           ", ethers.formatEther(tx.value), "ETH");
  console.log("Gas Used:        ", receipt.gasUsed.toString());

  // Decode input
  const iface = new ethers.Interface([
    "function mintAndLock(uint256 amount, uint64 durationEpochs, uint256 minWeight) payable returns (uint256 tokenId, uint256 positionId)"
  ]);

  try {
    const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
    console.log("\n--- DECODED FUNCTION CALL ---");
    console.log("Function:        ", decoded.name);
    console.log("Amount:          ", ethers.formatEther(decoded.args[0]), "NARA");
    console.log("Duration Epochs: ", decoded.args[1].toString(), `(${Number(decoded.args[1]) * 15 / 60 / 24} Days)`);
    console.log("Min Weight:      ", decoded.args[2].toString());
  } catch (e) {
    console.log("Raw input:", tx.data);
  }

  // Find minted token ID
  const nftAbi = [
    "function nextTokenId() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function positionIdOf(uint256 tokenId) view returns (uint256)",
    "function positionInfo(uint256 tokenId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))"
  ];
  const nft = new ethers.Contract(tx.to, nftAbi, provider);

  // Parse logs for Transfer or PositionMinted
  console.log("\n--- LOGS & EVENTS ---");
  for (const log of receipt.logs) {
    console.log(`Log from ${log.address} with topic ${log.topics[0]}`);
  }

  const nextId = await nft.nextTokenId();
  const mintedTokenId = nextId - 1n;
  console.log(`\n🎉 LATEST TOKEN ID ON THIS CONTRACT: #${mintedTokenId}`);

  const posId = await nft.positionIdOf(mintedTokenId);
  const posInfo = await nft.positionInfo(mintedTokenId);
  const uri = await nft.tokenURI(mintedTokenId);
  const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));

  console.log("\n==================================================================");
  console.log(`🎴 COLLECTOR CARD REVEAL (Token #${mintedTokenId} / Pos #${posId}):`);
  console.log("==================================================================");
  console.log("Name:            ", json.name);
  console.log("Principal:       ", ethers.formatEther(posInfo.amount), "NARA");
  console.log("Created Epoch:   ", posInfo.createdEpoch.toString());
  console.log("Unlock Epoch:    ", posInfo.unlockEpoch.toString());
  console.log("Duration Epochs: ", (posInfo.unlockEpoch - posInfo.createdEpoch).toString());
  console.log("\nAttributes:");
  for (const a of json.attributes) {
    console.log(`  • ${a.trait_type}: ${a.value}`);
  }
}

main().catch(console.error);
