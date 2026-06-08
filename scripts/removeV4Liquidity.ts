/**
 * Remove 100% liquidity from the configured Uniswap v4 position NFT.
 *
 * Required env:
 *   BASE_RPC_URL
 *   LIQ_PRIVATE_KEY
 *
 * Optional env:
 *   V4_LP_TOKEN_ID
 *   V4_NARA_TOKEN
 *   V4_BASE_TOKEN
 *   V4_POSITION_MANAGER
 *
 * Usage:
 *   npx tsx scripts/removeV4Liquidity.ts
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { currentV4Config, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const DECREASE_LIQUIDITY = 0x01;
const TAKE = 0x0e;
const OPEN_DELTA = 0n;

const PM_ABI = [
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity)",
  "function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable",
];

function buildUnlockData(
  tokenId: bigint,
  liquidity: bigint,
  recipient: string,
  currency0: string,
  currency1: string,
): string {
  const abi = ethers.AbiCoder.defaultAbiCoder();

  const actions = ethers.concat([
    new Uint8Array([DECREASE_LIQUIDITY]),
    new Uint8Array([TAKE]),
    new Uint8Array([TAKE]),
  ]);

  const decreaseParams = abi.encode(
    ["uint256", "uint128", "uint128", "uint128", "bytes"],
    [tokenId, liquidity, 0n, 0n, "0x"],
  );
  const take0Params = abi.encode(["address", "address", "uint256"], [currency0, recipient, OPEN_DELTA]);
  const take1Params = abi.encode(["address", "address", "uint256"], [currency1, recipient, OPEN_DELTA]);

  return abi.encode(["bytes", "bytes[]"], [actions, [decreaseParams, take0Params, take1Params]]);
}

async function main() {
  const rpcUrl = requiredEnv("BASE_RPC_URL");
  const liqKey = requiredEnv("LIQ_PRIVATE_KEY");
  const config = currentV4Config();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(liqKey, provider);
  const pm = new ethers.Contract(config.positionManager, PM_ABI, signer);
  const [currency0, currency1] = BigInt(config.token) < BigInt(config.base)
    ? [config.token, config.base]
    : [config.base, config.token];

  console.log("Uniswap v4 remove liquidity");
  console.log("Signer:           ", signer.address);
  console.log("Position manager: ", config.positionManager);
  console.log("LP token id:      ", config.lpTokenId.toString());
  console.log("Token/Base:       ", `${config.token} / ${config.base}`);
  console.log("");

  const owner = await pm.ownerOf(config.lpTokenId) as string;
  console.log("NFT owner:        ", owner);
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `NFT #${config.lpTokenId} is owned by ${owner}, not signer ${signer.address}. Check LIQ_PRIVATE_KEY.`,
    );
  }

  const liquidity = await pm.getPositionLiquidity(config.lpTokenId) as bigint;
  console.log("Liquidity:        ", liquidity.toString());
  if (liquidity === 0n) {
    console.log("Position already has zero liquidity.");
    return;
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;
  const unlockData = buildUnlockData(config.lpTokenId, liquidity, signer.address, currency0, currency1);

  console.log("Submitting DECREASE_LIQUIDITY + TAKE + TAKE...");
  const tx = await pm.modifyLiquidities(unlockData, deadline, { gasLimit: 700_000n });
  console.log("TX hash:", tx.hash);

  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Transaction reverted");
  }

  console.log("Liquidity removed successfully.");
  console.log("Assets returned to:", signer.address);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
