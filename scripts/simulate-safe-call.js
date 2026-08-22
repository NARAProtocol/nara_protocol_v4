import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const SAFE_ADDR = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
  const NFT_V5 = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
  const RENDERER_V7 = "0xDE0D4442f7cFEF38b3DE2fd03A9EbB32fD28F797";

  console.log("==================================================================");
  console.log("🔍 SIMULATING SAFE CALL TO 0xCcBD... ON BASE MAINNET");
  console.log("==================================================================");

  const iface = new ethers.Interface([
    "function setRenderer(address newRenderer) external",
    "function rendererFrozen() view returns (bool)",
    "function owner() view returns (address)"
  ]);

  const nft = new ethers.Contract(NFT_V5, iface, provider);
  const owner = await nft.owner();
  console.log("Contract Owner:", owner);
  console.log("Is Safe Owner?", owner.toLowerCase() === SAFE_ADDR.toLowerCase());

  // Simulate calling setRenderer as Safe
  const data = iface.encodeFunctionData("setRenderer", [RENDERER_V7]);

  try {
    const result = await provider.call({
      to: NFT_V5,
      from: SAFE_ADDR,
      data: data
    });
    console.log("Simulated call result:", result);
    console.log("✅ SIMULATION SUCCEEDED WITH ZERO REVERTS!");
  } catch (err) {
    console.error("❌ SIMULATION FAILED:");
    console.error(err);
  }
}

main().catch(console.error);
