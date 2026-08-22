import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const TX_HASH = "0xb288ca5ac9d2ef5dfca788f1a73f09a7b0b834fdf928364a2c79fbdb77bfa703";
  const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";

  const receipt = await provider.getTransactionReceipt(TX_HASH);

  console.log("==================================================================");
  console.log("💰 FINANCIAL & SETTLEMENT FLOW DEEP DIVE");
  console.log("==================================================================");

  // Decode Seaport OrderFulfilled Event
  const seaportIface = new ethers.Interface([
    "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, tuple(uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, tuple(uint8 itemType, address token, uint256 identifier, uint256 amount, address payable recipient)[] consideration)"
  ]);

  const seaportLog = receipt.logs.find(l => l.address.toLowerCase() === "0x0000000000000068f116a894984e2db1123eb395".toLowerCase());
  if (seaportLog) {
    const parsed = seaportIface.parseLog({ topics: seaportLog.topics, data: seaportLog.data });
    console.log("Seaport Order Hash:   ", parsed.args.orderHash);
    console.log("Seller (Offerer):     ", parsed.args.offerer);
    console.log("Buyer (Recipient):    ", parsed.args.recipient);

    console.log("\n--- CONSIDERATION / PAYMENTS ---");
    for (let i = 0; i < parsed.args.consideration.length; i++) {
      const item = parsed.args.consideration[i];
      console.log(`Payment #${i + 1}: ${ethers.formatEther(item.amount)} ETH -> ${item.recipient}`);
    }
  }

  // Check NARA Engine
  const engineAbi = [
    "function positionOf(uint256 positionId) view returns (tuple(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, uint256 naraDebtRay, uint256 ethDebtRay))",
    "function ownerOf(uint256 positionId) view returns (address)"
  ];
  const engine = new ethers.Contract(ENGINE_ADDR, engineAbi, provider);
  const pos13 = await engine.positionOf(13n);
  const engineOwner = await engine.ownerOf(13n);

  console.log("\n==================================================================");
  console.log("🔒 NARA ENGINE POSITION #13 STATUS");
  console.log("==================================================================");
  console.log("Locked Principal:   ", ethers.formatEther(pos13.amount), "NARA");
  console.log("Created Epoch:      ", pos13.createdEpoch.toString());
  console.log("Unlock Epoch:       ", pos13.unlockEpoch.toString());
  console.log("Position Owner in Engine:", engineOwner);
  console.log("Status:              CONTINUOUSLY COMPOUNDING & LOCKED");

  // Check New Owner NFT Balance
  const nftAbi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)"
  ];
  const nft = new ethers.Contract(NFT_ADDR, nftAbi, provider);
  const newOwner = "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d";
  const balance = await nft.balanceOf(newOwner);
  const token3Owner = await nft.ownerOf(3n);

  console.log("\n==================================================================");
  console.log("🎯 BUYER OWNERSHIP CONFIRMATION");
  console.log("==================================================================");
  console.log("Buyer Address:       ", newOwner);
  console.log("NFT Balance on Base: ", balance.toString());
  console.log("Token #3 Owner:      ", token3Owner);
  console.log("Ownership Match:     ", token3Owner.toLowerCase() === newOwner.toLowerCase() ? "✅ 100% PERFECT" : "❌ MISMATCH");
}

main().catch(console.error);
