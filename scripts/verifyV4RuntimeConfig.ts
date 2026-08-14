import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
  requiredBaseRpcUrl,
} from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env"), quiet: true });

async function main(): Promise<void> {
  const config = currentV4Config();
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, 8453, {
    staticNetwork: true,
    batchMaxCount: 1,
  });

  try {
    const deployment = await assertProductionV4Runtime(provider, config);
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Latest Base block is unavailable");
    console.log("NARA v4 production runtime guard: PASS");
    console.log(productionV4RuntimeBanner(deployment));
    console.log(`verifiedBlock=${block.number} verifiedBlockTimestamp=${block.timestamp}`);
  } finally {
    provider.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
