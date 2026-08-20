import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  encodePacked,
  formatUnits,
  http,
  keccak256,
  padHex,
  parseAbi,
} from "viem";
import { base } from "viem/chains";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../../..");
try {
  process.loadEnvFile(resolve(repositoryRoot, ".env"));
} catch {
  // The public Base RPC remains a usable fallback when no local env file exists.
}
const [manifest, engineArtifact, tokenArtifact] = await Promise.all([
  "deployments/v4-production-activation-2026-08-09.json",
  "artifacts/contracts/v4/NARAEngine.sol/NARAEngine.json",
  "artifacts/contracts/v4/NARAToken.sol/NARAToken.json",
].map(async (path) => JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"))));
const DEPLOYMENT = {
  engine: manifest.envSync.engine,
  nara: manifest.envSync.token,
  usdc: manifest.envSync.usdc,
  rewardReserve: manifest.envSync.rewardReserve,
  poolManager: manifest.envSync.poolManager,
  poolId: manifest.envSync.poolId,
  engineCodeHash: manifest.contracts.engine.runtimeCodeHash,
  naraCodeHash: manifest.contracts.token.runtimeCodeHash,
  changeId: manifest.changeId,
};
const engineAbi = engineArtifact.abi;
const tokenAbi = tokenArtifact.abi;
const poolManagerStateAbi = parseAbi([
  "function extsload(bytes32 slot) view returns (bytes32)",
]);

const client = createPublicClient({
  chain: base,
  transport: http(
    process.env.BASE_MAINNET_RPC_URL
      || process.env.BASE_RPC_URL
      || "https://mainnet.base.org",
  ),
});

const [
  blockNumber,
  engineCode,
  tokenCode,
  currentEpoch,
  epochState,
  nextPositionId,
  lockFeeBps,
  claimFeeBps,
  lockFeeWei,
  unlockFeeWei,
] = await Promise.all([
  client.getBlockNumber(),
  client.getBytecode({ address: DEPLOYMENT.engine }),
  client.getBytecode({ address: DEPLOYMENT.nara }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "currentEpoch" }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "epochState" }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "nextPositionId" }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "lockFeeBps" }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "claimFeeBps" }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "lockFeeWei" }),
  client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "unlockFeeWei" }),
]);

if (!engineCode || engineCode === "0x") throw new Error("Production Engine bytecode is missing");
if (!tokenCode || tokenCode === "0x") throw new Error("Production NARA bytecode is missing");
if (keccak256(engineCode).toLowerCase() !== DEPLOYMENT.engineCodeHash.toLowerCase()) {
  throw new Error("Production Engine bytecode hash does not match the activation manifest");
}
if (keccak256(tokenCode).toLowerCase() !== DEPLOYMENT.naraCodeHash.toLowerCase()) {
  throw new Error("Production NARA bytecode hash does not match the activation manifest");
}

const storedEpoch = epochState.epoch ?? epochState[0];
if (storedEpoch > currentEpoch) throw new Error("Stored epoch is ahead of the Engine clock");
if (lockFeeBps > 1_000n || claimFeeBps > 1_000n) {
  throw new Error("Production Engine percentage fee exceeds its 10% contract cap");
}
if (lockFeeWei > 10_000_000_000_000_000n || unlockFeeWei > 10_000_000_000_000_000n) {
  throw new Error("Production Engine flat ETH fee exceeds its 0.01 ETH contract cap");
}

const poolStateSlot = keccak256(encodePacked(
  ["bytes32", "bytes32"],
  [DEPLOYMENT.poolId, padHex("0x06", { size: 32 })],
));
const [rawSlot0, totalSupply, rewardReserveBalance, burnBalance] = await Promise.all([
  client.readContract({
    address: DEPLOYMENT.poolManager,
    abi: poolManagerStateAbi,
    functionName: "extsload",
    args: [poolStateSlot],
    blockNumber,
  }),
  client.readContract({
    address: DEPLOYMENT.nara,
    abi: tokenAbi,
    functionName: "totalSupply",
    blockNumber,
  }),
  client.readContract({
    address: DEPLOYMENT.nara,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [DEPLOYMENT.rewardReserve],
    blockNumber,
  }),
  client.readContract({
    address: DEPLOYMENT.nara,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: ["0x000000000000000000000000000000000000dEaD"],
    blockNumber,
  }),
]);
const sqrtPriceX96 = BigInt(rawSlot0) & ((1n << 160n) - 1n);
if (sqrtPriceX96 <= 0n) throw new Error("Production pool is not initialized");
const excludedSupply = rewardReserveBalance + burnBalance;
if (totalSupply <= 0n || excludedSupply > totalSupply) {
  throw new Error("Production market-supply inputs are inconsistent");
}
const priceX192 = sqrtPriceX96 * sqrtPriceX96;
const naraIsCurrency0 = BigInt(DEPLOYMENT.nara) < BigInt(DEPLOYMENT.usdc);
const spotPriceUsdcWad = naraIsCurrency0
  ? priceX192 * 10n ** 30n / (1n << 192n)
  : (1n << 192n) * 10n ** 30n / priceX192;
const provisionalCirculatingSupply = totalSupply - excludedSupply;
const provisionalMarketCapUsdcWad = provisionalCirculatingSupply * spotPriceUsdcWad / 10n ** 18n;
const fullyDilutedValueUsdcWad = totalSupply * spotPriceUsdcWad / 10n ** 18n;

console.log(JSON.stringify({
  chainId: base.id,
  blockNumber: blockNumber.toString(),
  engine: DEPLOYMENT.engine,
  token: DEPLOYMENT.nara,
  currentEpoch: currentEpoch.toString(),
  storedEpoch: storedEpoch.toString(),
  backlog: (currentEpoch - storedEpoch).toString(),
  nextPositionId: nextPositionId.toString(),
  fees: {
    lockTokenFeeBps: lockFeeBps.toString(),
    claimEthFeeBps: claimFeeBps.toString(),
    lockFlatFeeWei: lockFeeWei.toString(),
    unlockFlatFeeWei: unlockFeeWei.toString(),
  },
  bytecodeHashes: "verified",
  bindings: DEPLOYMENT.changeId,
  market: {
    spotUsdcPerNara: formatUnits(spotPriceUsdcWad, 18),
    provisionalCirculatingNara: formatUnits(provisionalCirculatingSupply, 18),
    provisionalMarketCapUsdc: formatUnits(provisionalMarketCapUsdcWad, 18),
    fullyDilutedValueUsdc: formatUnits(fullyDilutedValueUsdcWad, 18),
    supplyStatus: "PROVISIONAL_PENDING_MARKET_SUPPLY_ORACLE",
  },
}, null, 2));
