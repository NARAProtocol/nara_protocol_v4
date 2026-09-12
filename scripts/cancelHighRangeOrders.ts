import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RANGE_MANAGER_ADDRESS = "0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C";
const TREASURY_SAFE_ADDRESS = "0x5050BC6dc3E07313D52D05cecD53f727D6CDa245";

const RANGE_MANAGER_ABI = [
  "function cancel(uint256 orderId, uint128 minNaraOut, uint128 minUsdcOut, uint64 deadline) returns (uint256 naraOut, uint256 usdcOut)",
  "function assertOperationalClean() view returns (bool)",
];

export async function main() {
  const iface = new ethers.Interface(RANGE_MANAGER_ABI);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7); // 7 days
  const orderIdsToCancel = [3n, 4n, 5n, 6n, 7n, 8n];

  const transactions: any[] = [];

  for (const id of orderIdsToCancel) {
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: iface.encodeFunctionData("cancel", [id, 0n, 0n, deadline]),
      contractMethod: null,
      contractInputsValues: null,
    });
  }

  // Invariant check
  transactions.push({
    to: RANGE_MANAGER_ADDRESS,
    value: "0",
    data: iface.encodeFunctionData("assertOperationalClean", []),
    contractMethod: null,
    contractInputsValues: null,
  });

  const batchPayload = {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: "Cancel High-Range Dormant Orders #3-#8",
      description: "Recalls 84,444.44 NARA locked between $0.16 and $1.30 back to Treasury Safe custody.",
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: TREASURY_SAFE_ADDRESS,
    },
    transactions,
  };

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const batchFilename = `UNEXECUTED-cancel-high-range-orders-${Date.now()}.json`;
  const batchPath = path.join(deploymentsDir, batchFilename);
  fs.writeFileSync(batchPath, JSON.stringify(batchPayload, null, 2));

  console.log("================================================================================");
  console.log("? High-Range Cancellation Batch Successfully Generated!");
  console.log(`?? File: ${batchPath}`);
  console.log("================================================================================");
}

main().catch(console.error);
