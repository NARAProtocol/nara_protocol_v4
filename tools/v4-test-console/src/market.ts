import {
  encodePacked,
  keccak256,
  padHex,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { DEPLOYMENT, erc20Abi } from "./generated/contracts";

const Q192 = 1n << 192n;
const USDC_PER_NARA_WAD_SCALE = 10n ** 30n;
const SLOT0_SQRT_PRICE_MASK = (1n << 160n) - 1n;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as Address;

const poolManagerStateAbi = parseAbi([
  "function extsload(bytes32 slot) view returns (bytes32)",
]);

export type MarketValuation = {
  spotPriceUsdcWad: bigint;
  provisionalCirculatingSupply: bigint;
  totalSupply: bigint;
  provisionalMarketCapUsdcWad: bigint;
  fullyDilutedValueUsdcWad: bigint;
};

export function poolStateSlot(poolId: Hex): Hex {
  return keccak256(encodePacked(
    ["bytes32", "bytes32"],
    [poolId, padHex("0x06", { size: 32 })],
  ));
}

export function sqrtPriceX96FromSlot0(rawSlot0: Hex): bigint {
  const sqrtPriceX96 = BigInt(rawSlot0) & SLOT0_SQRT_PRICE_MASK;
  if (sqrtPriceX96 <= 0n) throw new Error("The production pool is not initialized.");
  return sqrtPriceX96;
}

export function usdcPerNaraWad(sqrtPriceX96: bigint, naraIsCurrency0: boolean): bigint {
  if (sqrtPriceX96 <= 0n) throw new Error("sqrtPriceX96 must be positive.");
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  return naraIsCurrency0
    ? priceX192 * USDC_PER_NARA_WAD_SCALE / Q192
    : Q192 * USDC_PER_NARA_WAD_SCALE / priceX192;
}

export function calculateMarketValuation(input: {
  sqrtPriceX96: bigint;
  naraIsCurrency0: boolean;
  totalSupply: bigint;
  excludedBalances: readonly bigint[];
}): MarketValuation {
  const excludedSupply = input.excludedBalances.reduce((sum, value) => {
    if (value < 0n) throw new Error("Excluded balances cannot be negative.");
    return sum + value;
  }, 0n);
  if (input.totalSupply <= 0n) throw new Error("NARA total supply is unavailable.");
  if (excludedSupply > input.totalSupply) {
    throw new Error("Excluded balances exceed NARA total supply.");
  }

  const spotPriceUsdcWad = usdcPerNaraWad(input.sqrtPriceX96, input.naraIsCurrency0);
  const provisionalCirculatingSupply = input.totalSupply - excludedSupply;
  return {
    spotPriceUsdcWad,
    provisionalCirculatingSupply,
    totalSupply: input.totalSupply,
    provisionalMarketCapUsdcWad: provisionalCirculatingSupply * spotPriceUsdcWad / 10n ** 18n,
    fullyDilutedValueUsdcWad: input.totalSupply * spotPriceUsdcWad / 10n ** 18n,
  };
}

export async function readMarketValuation(
  client: PublicClient,
  blockNumber: bigint,
): Promise<MarketValuation> {
  const [rawSlot0, totalSupply, rewardReserveBalance, burnBalance] = await Promise.all([
    client.readContract({
      address: DEPLOYMENT.poolManager,
      abi: poolManagerStateAbi,
      functionName: "extsload",
      args: [poolStateSlot(DEPLOYMENT.poolId)],
      blockNumber,
    }),
    client.readContract({
      address: DEPLOYMENT.nara,
      abi: erc20Abi,
      functionName: "totalSupply",
      blockNumber,
    }),
    client.readContract({
      address: DEPLOYMENT.nara,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [DEPLOYMENT.rewardReserve],
      blockNumber,
    }),
    client.readContract({
      address: DEPLOYMENT.nara,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [DEAD_ADDRESS],
      blockNumber,
    }),
  ]);

  return calculateMarketValuation({
    sqrtPriceX96: sqrtPriceX96FromSlot0(rawSlot0),
    naraIsCurrency0: BigInt(DEPLOYMENT.nara) < BigInt(DEPLOYMENT.usdc),
    totalSupply,
    excludedBalances: [rewardReserveBalance, burnBalance],
  });
}
