import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const engineAbi = [
    "function config() view returns (tuple(uint256 eMax, uint256 beta0Wad, uint256 mWad, uint256 aWad, uint256 bWad, uint256 cWad, uint256 dWad, uint256 dripSplitWad, uint256 durationLinearWad, uint256 durationQuadraticWad, uint256 growthFactorWad, uint256 minBaseEmission, uint256 maxBaseEmission, uint256 warmupRateWad, uint256 bootstrapInitialWeight, uint256 bootstrapDecayWad, uint64 activationDelayEpochs, uint64 maxLockEpochs))",
    "function lockFeeWei() view returns (uint96)",
    "function unlockFeeWei() view returns (uint96)",
    "function lockFeeBps() view returns (uint16)"
  ];
  const engine = new ethers.Contract(ENGINE_ADDR, engineAbi, provider);

  const cfg = await engine.config();
  const lockFeeWei = await engine.lockFeeWei();
  const unlockFeeWei = await engine.unlockFeeWei();
  const lockFeeBps = await engine.lockFeeBps();

  console.log("==================================================================");
  console.log("🔒 NARA ENGINE ON-CHAIN LOCK PARAMETERS (BASE MAINNET)");
  console.log("==================================================================");
  console.log("Activation Delay:   ", cfg.activationDelayEpochs.toString(), "epochs (", (Number(cfg.activationDelayEpochs) * 15), "minutes )");
  console.log("Min Lock Duration:  ", (Number(cfg.activationDelayEpochs) + 1), "epochs (", ((Number(cfg.activationDelayEpochs) + 1) * 15), "minutes = 1 Hour )");
  console.log("Max Lock Duration:  ", cfg.maxLockEpochs.toString(), "epochs (", (Number(cfg.maxLockEpochs) * 15 / 60 / 24), "days = 1 Year )");
  console.log("Flat Lock Fee:      ", ethers.formatEther(lockFeeWei), "ETH");
  console.log("Flat Unlock Fee:    ", ethers.formatEther(unlockFeeWei), "ETH");
  console.log("Percentage Lock Fee:", (Number(lockFeeBps) / 100).toFixed(2), "%");
}

main().catch(console.error);
