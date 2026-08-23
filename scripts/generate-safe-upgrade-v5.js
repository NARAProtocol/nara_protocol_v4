import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const NFT_V5 = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
  const RENDERER_V7 = "0xDE0D4442f7cFEF38b3DE2fd03A9EbB32fD28F797";

  console.log("==================================================================");
  console.log("🏛️ GENERATING SAFE MULTI-SIG BATCH TO UPGRADE V5 TO V7 ART ENGINE");
  console.log("==================================================================");

  const iface = new ethers.Interface(["function setRenderer(address newRenderer) external"]);
  const data = iface.encodeFunctionData("setRenderer", [RENDERER_V7]);

  const safeBatch = {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: "Upgrade V5 Position NFT to V7 Luxury Generative Renderer with Luck Multiplier",
      description: "Sets NARAPositionRendererV7 (0xDE0D4442f7cFEF38b3DE2fd03A9EbB32fD28F797) on NARAPositionNFTV4 (0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC) to upgrade all 14 minted tokens to generative alloys and luck boosts on OpenSea.",
      txBuilderVersion: "1.16.5"
    },
    transactions: [
      {
        to: NFT_V5,
        value: "0",
        data: data,
        contractMethod: {
          inputs: [{ internalType: "address", name: "newRenderer", type: "address" }],
          name: "setRenderer",
          payable: false
        },
        contractInputsValues: {
          newRenderer: RENDERER_V7
        }
      }
    ]
  };

  const fs = await import("fs");
  fs.writeFileSync("deployments/SAFE-BATCH-upgrade-v5-to-v7-renderer.json", JSON.stringify(safeBatch, null, 2));
  console.log("✅ Safe Batch Created: deployments/SAFE-BATCH-upgrade-v5-to-v7-renderer.json");
}

main().catch(console.error);
