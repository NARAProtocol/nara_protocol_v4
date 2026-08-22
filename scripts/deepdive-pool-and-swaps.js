import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
  const HOOK = "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088";
  const NARA = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const POOL_ID = "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464";

  console.log("==================================================================");
  console.log("🌊 UNISWAP V4 SWAP & HOOK EVENT FORENSICS");
  console.log("==================================================================");

  const currentBlock = await provider.getBlockNumber();
  console.log("Current Base Block Height:", currentBlock);

  // Hook Fee Taken Events
  const hookAbi = [
    "event PoolFeeTaken(bytes32 indexed poolId, address indexed sender, address indexed currency, uint256 amountIn, uint256 feeAmount, uint16 feeBps, bool isBuy)"
  ];
  const hook = new ethers.Contract(HOOK, hookAbi, provider);

  // Pool Manager Swap Events
  const pmAbi = [
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
  ];
  const pm = new ethers.Contract(POOL_MANAGER, pmAbi, provider);

  // Query in 5k chunks for the last 50k blocks
  const CHUNK_SIZE = 5000;
  const TOTAL_BLOCKS = 40000;
  const startBlock = currentBlock - TOTAL_BLOCKS;

  let allSwaps = [];
  let allHookFees = [];

  console.log(`Scanning blocks ${startBlock} to ${currentBlock}...`);
  for (let from = startBlock; from < currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    const [swaps, fees] = await Promise.all([
      pm.queryFilter(pm.filters.Swap(POOL_ID), from, to),
      hook.queryFilter(hook.filters.PoolFeeTaken(POOL_ID), from, to)
    ]);
    allSwaps.push(...swaps);
    allHookFees.push(...fees);
  }

  console.log(`\nFound ${allSwaps.length} Swap(s) and ${allHookFees.length} Dynamic Hook Fee Event(s)`);

  for (let i = 0; i < allSwaps.length; i++) {
    const s = allSwaps[i];
    const { amount0, amount1, sqrtPriceX96, tick, fee } = s.args;
    console.log(`\n--- [Swap #${i + 1}] Block ${s.blockNumber} ---`);
    console.log("  Tx Hash:     ", s.transactionHash);
    console.log("  Caller:      ", s.args.sender);
    console.log("  USDC Delta:  ", ethers.formatUnits(amount0, 6), "USDC", amount0 < 0n ? "(Buyer received USDC)" : "(Buyer paid USDC)");
    console.log("  NARA Delta:  ", ethers.formatEther(amount1), "NARA", amount1 < 0n ? "(Buyer received NARA)" : "(Buyer paid NARA)");
    console.log("  Pool Tick:   ", tick.toString());
    console.log("  Pool Fee:    ", (Number(fee) / 10000).toFixed(4), "% (", fee.toString(), "BPS )");

    // Match with Hook event if in same tx
    const hookEv = allHookFees.find(f => f.transactionHash.toLowerCase() === s.transactionHash.toLowerCase());
    if (hookEv) {
      console.log("  ⚡ Hook Captured Fee:");
      console.log("     Fee Amount: ", hookEv.args.currency.toLowerCase() === USDC.toLowerCase() ? ethers.formatUnits(hookEv.args.feeAmount, 6) + " USDC" : ethers.formatEther(hookEv.args.feeAmount) + " NARA");
      console.log("     Fee Rate:   ", (Number(hookEv.args.feeBps) / 100).toFixed(2), "% (", hookEv.args.feeBps.toString(), "BPS )");
      console.log("     Is Buy:     ", hookEv.args.isBuy);
    }
  }

  // Token balances in PoolManager
  const erc20Abi = ["function balanceOf(address account) view returns (uint256)"];
  const naraToken = new ethers.Contract(NARA, erc20Abi, provider);
  const usdcToken = new ethers.Contract(USDC, erc20Abi, provider);

  const pmNara = await naraToken.balanceOf(POOL_MANAGER);
  const pmUsdc = await usdcToken.balanceOf(POOL_MANAGER);

  console.log("\n==================================================================");
  console.log("📊 CURRENT UNISWAP V4 POOL STATUS");
  console.log("==================================================================");
  console.log("Pool ID:                 ", POOL_ID);
  console.log("NARA in Pool Reserves:   ", ethers.formatEther(pmNara), "NARA");
  console.log("USDC in Pool Reserves:   ", ethers.formatUnits(pmUsdc, 6), "USDC");
  if (pmUsdc > 0n && pmNara > 0n) {
    const price = (Number(ethers.formatUnits(pmUsdc, 6)) / Number(ethers.formatEther(pmNara)));
    console.log("Spot Reserve Ratio Price: $", price.toFixed(6), "USDC per NARA");
  }
}

main().catch(console.error);
