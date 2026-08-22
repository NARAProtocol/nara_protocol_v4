import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const GENESIS_PLATE = "0x5e8bb713a7Feb6E2C7ae9d61e2Eb256B8FA1F8d1";
  const code = await provider.getCode(GENESIS_PLATE);
  console.log("GenesisPlate code length:", code.length);

  const iface = new ethers.Interface([
    "function svg(uint8 tier, uint256 seed, bool isEternal, uint256 tokenId, uint256 positionId, uint16 roundId, uint16 tierId, uint64 mintedAt, uint32 claimCount, uint32 extendCount) view returns (string)",
    "function svg(uint8 tier, uint256 seed, bool isEternal, uint256 tokenId, uint256 positionId, uint16 roundId, uint16 tierId, uint32 mult, uint64 mintedAt, uint32 claimCount, uint32 extendCount) view returns (string)"
  ]);

  try {
    const data = iface.encodeFunctionData("svg(uint8,uint256,bool,uint256,uint256,uint16,uint16,uint64,uint32,uint32)", [0, 1234, true, 2, 16, 1, 1, 1000, 0, 0]);
    const res = await provider.call({ to: GENESIS_PLATE, data });
    console.log("Call with 10 args succeeded!");
  } catch (e) {
    console.log("Call with 10 args failed:", e.message);
  }

  try {
    const data = iface.encodeFunctionData("svg(uint8,uint256,bool,uint256,uint256,uint16,uint16,uint32,uint64,uint32,uint32)", [0, 1234, true, 2, 16, 1, 1, 50000, 1000, 0, 0]);
    const res = await provider.call({ to: GENESIS_PLATE, data });
    console.log("Call with 11 args succeeded!");
  } catch (e) {
    console.log("Call with 11 args failed:", e.message);
  }
}

main().catch(console.error);
