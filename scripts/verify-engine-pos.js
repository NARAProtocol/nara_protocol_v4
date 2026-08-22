import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";

  const engineAbi = [
    "function positionOf(uint256 positionId) view returns (tuple(address owner, uint64 createdEpoch, uint32 flags, uint128 amount, uint128 weight, uint64 activationEpoch, uint64 unlockEpoch, uint128 tokenWeight, uint256 naraDebtRay, uint256 ethDebtRay))"
  ];
  const engine = new ethers.Contract(ENGINE_ADDR, engineAbi, provider);
  const pos = await engine.positionOf(13n);

  console.log("=== ENGINE POSITION #13 DATA ===");
  console.log("Owner (TBA):      ", pos.owner);
  console.log("Locked Amount:    ", ethers.formatEther(pos.amount), "NARA");
  console.log("Weight:           ", ethers.formatEther(pos.weight));
  console.log("Created Epoch:    ", pos.createdEpoch.toString());
  console.log("Activation Epoch: ", pos.activationEpoch.toString());
  console.log("Unlock Epoch:     ", pos.unlockEpoch.toString());
  console.log("NARA Debt Ray:    ", pos.naraDebtRay.toString());
  console.log("ETH Debt Ray:     ", pos.ethDebtRay.toString());

  const nftAbi = [
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function accountOf(uint256 tokenId) view returns (address)"
  ];
  const nft = new ethers.Contract(NFT_ADDR, nftAbi, provider);
  const token3Owner = await nft.ownerOf(3n);
  const token3Tba = await nft.accountOf(3n);

  console.log("\n=== NFT CONTRACT TOKEN #3 ===");
  console.log("Current NFT Owner (Buyer):", token3Owner);
  console.log("NFT Token-Bound Account: ", token3Tba);
  console.log("TBA matches Engine Owner:", token3Tba.toLowerCase() === pos.owner.toLowerCase());
}

main().catch(console.error);
