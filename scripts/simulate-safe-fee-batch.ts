import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const SAFE_ADDR = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
  const NEW_LOCK_FEE_WEI = ethers.parseEther("0.00035");

  console.log("==================================================================");
  console.log("🧪 SIMULATING SAFE MULTI-SIG FEE UPDATE TRANSACTION");
  console.log("==================================================================");

  const engineAbi = [
    "function setLockEthFee(uint96 feeWei) external",
    "function setUnlockEthFee(uint96 feeWei) external",
    "function lockFeeWei() view returns (uint96)",
    "function unlockFeeWei() view returns (uint96)"
  ];
  const engine = new ethers.Contract(ENGINE_ADDR, engineAbi, provider);

  const currentLockFee = await engine.lockFeeWei();
  console.log("Current Lock Fee: ", ethers.formatEther(currentLockFee), "ETH");

  // Call static simulation from Safe address
  const dataLock = engine.interface.encodeFunctionData("setLockEthFee", [NEW_LOCK_FEE_WEI]);
  const dataUnlock = engine.interface.encodeFunctionData("setUnlockEthFee", [0n]);

  console.log("\nSimulating setLockEthFee(0.00035 ETH) from Safe...");
  await provider.call({
    from: SAFE_ADDR,
    to: ENGINE_ADDR,
    data: dataLock
  });
  console.log("✅ Simulation SUCCESS: setLockEthFee succeeds without revert!");

  console.log("\nSimulating setUnlockEthFee(0 ETH) from Safe...");
  await provider.call({
    from: SAFE_ADDR,
    to: ENGINE_ADDR,
    data: dataUnlock
  });
  console.log("✅ Simulation SUCCESS: setUnlockEthFee succeeds without revert!");
  console.log("==================================================================");
}

main().catch(console.error);
