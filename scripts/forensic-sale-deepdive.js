import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const TX_HASH = "0xb288ca5ac9d2ef5dfca788f1a73f09a7b0b834fdf928364a2c79fbdb77bfa703";
  const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const TOKEN_ID = 3n;

  console.log("==================================================================");
  console.log("🕵️ TRANSACTION FORENSICS: OPENSEA SECONDARY MARKET SALE");
  console.log("==================================================================");
  console.log("Tx Hash:", TX_HASH);

  const tx = await provider.getTransaction(TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  console.log("Block Number: ", receipt.blockNumber);
  console.log("Gas Used:     ", receipt.gasUsed.toString());
  console.log("Interacted With (Contract):", tx.to);

  // Parse receipt logs
  console.log("\n--- EVENT LOGS ANALYSIS (Total Events: " + receipt.logs.length + ") ---");
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`[Log #${i}] Address: ${log.address} | Topic0: ${log.topics[0]}`);
  }

  // Check Token #3 on NFT contract
  const nftAbi = [
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function accountOf(uint256 tokenId) view returns (address)",
    "function positionIdOf(uint256 tokenId) view returns (uint256)",
    "function positionInfo(uint256 tokenId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))"
  ];
  const nft = new ethers.Contract(NFT_ADDR, nftAbi, provider);

  const newOwner = await nft.ownerOf(TOKEN_ID);
  const tba = await nft.accountOf(TOKEN_ID);
  const posId = await nft.positionIdOf(TOKEN_ID);
  const pos = await nft.positionInfo(TOKEN_ID);

  console.log("\n==================================================================");
  console.log("📊 POST-SALE STATE VERIFICATION");
  console.log("==================================================================");
  console.log("Token ID:          #3");
  console.log("New Owner:        ", newOwner);
  console.log("Token-Bound Acct: ", tba);
  console.log("Engine Position:   #", posId.toString());
  console.log("Locked Principal: ", ethers.formatEther(pos.amount), "NARA");
  console.log("Created Epoch:    ", pos.createdEpoch.toString());
  console.log("Unlock Epoch:     ", pos.unlockEpoch.toString());

  // Check TBA contract
  const tbaAbi = [
    "function owner() view returns (address)",
    "function positionId() view returns (uint256)",
    "function isAuthorized(address caller) view returns (bool)"
  ];
  const tbaContract = new ethers.Contract(tba, tbaAbi, provider);
  const tbaOwner = await tbaContract.owner();
  const isNewOwnerAuth = await tbaContract.isAuthorized(newOwner);
  const isOldOwnerAuth = await tbaContract.isAuthorized("0xAE9D1667B45558232BeD9d45DcCA53940F892aB5");

  console.log("\n==================================================================");
  console.log("🔐 ERC-6551 TOKEN-BOUND ACCOUNT AUTHENTICATION AUDIT");
  console.log("==================================================================");
  console.log("TBA Owner Resolution:        ", tbaOwner, "(Matches New Owner:", tbaOwner.toLowerCase() === newOwner.toLowerCase(), ")");
  console.log("Is New Owner Authorized:     ", isNewOwnerAuth);
  console.log("Is Old Seller Authorized:    ", isOldOwnerAuth, "(Must be FALSE)");

  // Check NARA Engine Position
  const engineAbi = [
    "function positionOf(uint256 positionId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))",
    "function ownerOf(uint256 positionId) view returns (address)"
  ];
  const engine = new ethers.Contract(ENGINE_ADDR, engineAbi, provider);
  const engineOwner = await engine.ownerOf(posId);
  console.log("\n==================================================================");
  console.log("⚙️ NARA ENGINE SETTLEMENT AUDIT");
  console.log("==================================================================");
  console.log("NARA Engine Position #", posId.toString(), "Owner:", engineOwner);
  console.log("Matches TBA:", engineOwner.toLowerCase() === tba.toLowerCase());
}

main().catch(console.error);
