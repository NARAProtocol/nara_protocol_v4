import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const SAFE_ADDR = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
  const CHAIN_ID = 8453;

  // 0.00035 ETH ≈ $1.00 USD (at ~$2,850 ETH)
  const NEW_LOCK_FEE_WEI = ethers.parseEther("0.00035"); // 350000000000000 wei
  console.log("New Lock Fee:", ethers.formatEther(NEW_LOCK_FEE_WEI), "ETH (≈ $1.00 USD)");

  const engineIface = new ethers.Interface([
    "function setLockEthFee(uint96 feeWei) external",
    "function setUnlockEthFee(uint96 feeWei) external"
  ]);

  const dataLock = engineIface.encodeFunctionData("setLockEthFee", [NEW_LOCK_FEE_WEI]);
  const dataUnlock = engineIface.encodeFunctionData("setUnlockEthFee", [0n]); // Keep unlock free

  const safeBatch = {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: "Update NARA Engine Flat Lock Fee to ~1 USD in ETH",
      description: "Sets flat anti-spam lock fee on NARAEngine to 0.00035 ETH (~$1.00 USD) and unlock fee to 0.",
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: SAFE_ADDR,
      createdFromOwnerAddress: ""
    },
    transactions: [
      {
        to: ENGINE_ADDR,
        value: "0",
        data: dataLock,
        contractMethod: {
          inputs: [
            {
              name: "feeWei",
              type: "uint96",
              internalType: "uint96"
            }
          ],
          name: "setLockEthFee",
          payable: false
        },
        contractInputsValues: {
          feeWei: NEW_LOCK_FEE_WEI.toString()
        }
      },
      {
        to: ENGINE_ADDR,
        value: "0",
        data: dataUnlock,
        contractMethod: {
          inputs: [
            {
              name: "feeWei",
              type: "uint96",
              internalType: "uint96"
            }
          ],
          name: "setUnlockEthFee",
          payable: false
        },
        contractInputsValues: {
          feeWei: "0"
        }
      }
    ]
  };

  const outputPath = "Safe-Batch-Set-Lock-Fee-1USD.json";
  fs.writeFileSync(outputPath, JSON.stringify(safeBatch, null, 2));
  console.log(`\n✅ Safe Transaction Batch saved to: ${outputPath}`);
  console.log("Transactions:");
  console.log(`  1. NARAEngine.setLockEthFee(${NEW_LOCK_FEE_WEI.toString()}) [0.00035 ETH ≈ $1.00]`);
  console.log(`  2. NARAEngine.setUnlockEthFee(0) [0 ETH]`);
}

main().catch(console.error);
