import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

dotenv.config({ path: resolve(import.meta.dirname, "..", ".env") });

const EXPECTED_CHAIN_ID = 8453n;
const EXPECTED_CURRENT_DEPTH = ethers.parseUnits("30", 18);
const EXPECTED_TARGET_DEPTH = ethers.parseUnits("60000", 18);

const HOOK_ABI = [
  "function owner() view returns (address)",
  "function protocolDepth(address currency) view returns (uint256)",
  "function pendingProtocolDepth(address currency) view returns (uint256 depth,uint48 eta,bool exists)",
  "function executeProtocolDepth(address currency)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Expected Base mainnet chainId ${EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  const config = currentV4Config();
  const signer = new ethers.Wallet(requiredEnv("OWNER_PRIVATE_KEY"), provider);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, signer);

  const [owner, currentDepth, pending, latestBlock] = await Promise.all([
    hook.owner() as Promise<string>,
    hook.protocolDepth(config.token) as Promise<bigint>,
    hook.pendingProtocolDepth(config.token) as Promise<{ depth: bigint; eta: bigint; exists: boolean }>,
    provider.getBlock("latest"),
  ]);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Configured signer ${signer.address} is not hook owner ${owner}`);
  }
  if (currentDepth !== EXPECTED_CURRENT_DEPTH) {
    throw new Error(
      `Expected current NARA depth ${ethers.formatUnits(EXPECTED_CURRENT_DEPTH, 18)}, ` +
      `got ${ethers.formatUnits(currentDepth, 18)}`,
    );
  }
  if (!pending.exists) {
    throw new Error("No pending NARA protocol-depth update exists");
  }
  if (pending.depth !== EXPECTED_TARGET_DEPTH) {
    throw new Error(
      `Expected pending NARA depth ${ethers.formatUnits(EXPECTED_TARGET_DEPTH, 18)}, ` +
      `got ${ethers.formatUnits(pending.depth, 18)}`,
    );
  }
  if (!latestBlock || BigInt(latestBlock.timestamp) < pending.eta) {
    throw new Error(`Pending NARA depth is timelocked until Unix timestamp ${pending.eta}`);
  }

  console.log("Executing reviewed NARA protocol-depth update");
  console.log("Chain ID:       ", network.chainId.toString());
  console.log("Hook:           ", config.hook);
  console.log("NARA:           ", config.token);
  console.log("Owner:          ", owner);
  console.log("Current depth:  ", ethers.formatUnits(currentDepth, 18));
  console.log("Pending depth:  ", ethers.formatUnits(pending.depth, 18));
  console.log("Pending ETA:    ", pending.eta.toString());

  await hook.executeProtocolDepth.staticCall(config.token);
  const gasEstimate = await hook.executeProtocolDepth.estimateGas(config.token);
  console.log("Gas estimate:   ", gasEstimate.toString());

  const transaction = await hook.executeProtocolDepth(config.token);
  console.log("Transaction:    ", transaction.hash);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("executeProtocolDepth transaction failed");
  }

  const [finalDepth, finalPending] = await Promise.all([
    hook.protocolDepth(config.token) as Promise<bigint>,
    hook.pendingProtocolDepth(config.token) as Promise<{ depth: bigint; eta: bigint; exists: boolean }>,
  ]);
  if (finalDepth !== EXPECTED_TARGET_DEPTH || finalPending.exists) {
    throw new Error(
      `Post-transaction verification failed: depth=${ethers.formatUnits(finalDepth, 18)} ` +
      `pendingExists=${finalPending.exists}`,
    );
  }

  console.log("Confirmed block: ", receipt.blockNumber);
  console.log("Final depth:     ", ethers.formatUnits(finalDepth, 18));
  console.log("Pending cleared: ", !finalPending.exists);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
