import { ethers } from "ethers";
import { type TokenInfo } from "./tokens";

export interface SupportedChain {
  id: number;
  name: string;
  slug: string;
  nativeSymbol: string;
  rpcUrl: string;
  blockExplorer: string;
  icon: string;
}

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    id: 8453,
    name: "Base",
    slug: "base",
    nativeSymbol: "ETH",
    rpcUrl: "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
    icon: "/tokens/base.png",
  },
  {
    id: 1,
    name: "Ethereum",
    slug: "ethereum",
    nativeSymbol: "ETH",
    rpcUrl: "https://eth.llamarpc.com",
    blockExplorer: "https://etherscan.io",
    icon: "/tokens/eth.png",
  },
  {
    id: 42161,
    name: "Arbitrum",
    slug: "arbitrum",
    nativeSymbol: "ETH",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io",
    icon: "/tokens/arb.png",
  },
  {
    id: 10,
    name: "Optimism",
    slug: "optimism",
    nativeSymbol: "ETH",
    rpcUrl: "https://mainnet.optimism.io",
    blockExplorer: "https://optimistic.etherscan.io",
    icon: "/tokens/op.png",
  },
  {
    id: 137,
    name: "Polygon",
    slug: "polygon",
    nativeSymbol: "POL",
    rpcUrl: "https://polygon-rpc.com",
    blockExplorer: "https://polygonscan.com",
    icon: "/tokens/pol.png",
  },
];

export const NARA_V4_CONFIG = {
  token: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  hook: "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088",
  vault: "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  v4Quoter: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
  fee: 3000,
  tickSpacing: 60,
  poolId: "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464",
} as const;

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

const QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];

export interface UnifiedQuoteResult {
  amountOut: string;
  amountOutFormatted: string;
  exchangeRate: string;
  fromUsd: number;
  toUsd: number;
  routeType: "v4_hook" | "kyber" | "composite";
  routeLabel: string;
  routeSummary?: any;
  gasEstimate?: string;
}

/**
 * Direct quote from the canonical NARA Uniswap v4 Hook on Base.
 */
export async function getV4HookQuote(
  isBuy: boolean, // true: USDC -> NARA, false: NARA -> USDC
  amountInStr: string
): Promise<UnifiedQuoteResult> {
  const provider = new ethers.providers.JsonRpcProvider("https://mainnet.base.org");
  const quoter = new ethers.Contract(NARA_V4_CONFIG.v4Quoter, QUOTER_ABI, provider);

  const poolKey = {
    currency0: NARA_V4_CONFIG.base, // USDC
    currency1: NARA_V4_CONFIG.token, // NARA
    fee: NARA_V4_CONFIG.fee,
    tickSpacing: NARA_V4_CONFIG.tickSpacing,
    hooks: NARA_V4_CONFIG.hook,
  };

  const clean = amountInStr.replace(/,/g, "");
  const num = parseFloat(clean);
  const decimalsIn = isBuy ? 6 : 18;
  const decimalsOut = isBuy ? 18 : 6;
  const amountInWei = ethers.utils.parseUnits(clean, decimalsIn);

  const res = await quoter.callStatic.quoteExactInputSingle({
    poolKey,
    zeroForOne: isBuy,
    exactAmount: amountInWei,
    hookData: "0x",
  });

  const amountOutFormatted = ethers.utils.formatUnits(res.amountOut, decimalsOut);
  const outNum = parseFloat(amountOutFormatted);
  const rate = num > 0 ? (outNum / num).toFixed(6) : "0";

  // Approximate USD values
  const naraUsdPrice = isBuy ? (outNum > 0 ? num / outNum : 0.1147) : (num > 0 ? outNum / num : 0.1147);
  const fromUsd = isBuy ? num : num * naraUsdPrice;
  const toUsd = isBuy ? outNum * naraUsdPrice : outNum;

  return {
    amountOut: res.amountOut.toString(),
    amountOutFormatted: outNum > 1000 ? outNum.toLocaleString(undefined, { maximumFractionDigits: 6 }) : outNum.toFixed(6),
    exchangeRate: rate,
    fromUsd,
    toUsd,
    routeType: "v4_hook",
    routeLabel: "Uniswap v4 NARA Hook (Direct 0% Routing Fee)",
    gasEstimate: "< 0.0001 ETH",
  };
}

/**
 * Quote via KyberSwap Aggregator API for any token on any supported chain.
 */
export async function getKyberQuote(
  chainSlug: string,
  tokenInAddress: string,
  tokenOutAddress: string,
  amountInStr: string,
  decimalsIn: number,
  decimalsOut: number
): Promise<UnifiedQuoteResult> {
  const clean = amountInStr.replace(/,/g, "");
  const num = parseFloat(clean);
  const amountInWei = ethers.utils.parseUnits(clean, decimalsIn).toString();

  const url = `https://aggregator-api.kyberswap.com/${chainSlug}/api/v1/routes?tokenIn=${tokenInAddress}&tokenOut=${tokenOutAddress}&amountIn=${amountInWei}&saveGas=false&gasInclude=true`;
  const res = await fetch(url, { headers: { "x-client-id": "nara-dex" } });
  const data = await res.json();

  if (data.code === 0 && data.data?.routeSummary) {
    const s = data.data.routeSummary;
    const outFormatted = ethers.utils.formatUnits(s.amountOut, decimalsOut);
    const outNum = parseFloat(outFormatted);
    const rate = num > 0 ? (outNum / num).toFixed(6) : "0";

    return {
      amountOut: s.amountOut,
      amountOutFormatted: outNum > 1000 ? outNum.toLocaleString(undefined, { maximumFractionDigits: 6 }) : outNum.toFixed(6),
      exchangeRate: rate,
      fromUsd: parseFloat(s.amountInUsd) || 0,
      toUsd: parseFloat(s.amountOutUsd) || 0,
      routeType: "kyber",
      routeLabel: `Kyber Multi-DEX Route (${s.route?.[0]?.length || 1} hops)`,
      routeSummary: s,
      gasEstimate: s.gasUsd ? `$${parseFloat(s.gasUsd).toFixed(4)}` : "< 0.0001 ETH",
    };
  }

  throw new Error(data.message || "Route not found");
}

/**
 * Composite Quote: TokenIn -> USDC (via Kyber) -> NARA (via Uniswap v4 Hook).
 */
export async function getCompositeTokenToNaraQuote(
  tokenIn: TokenInfo,
  amountInStr: string
): Promise<UnifiedQuoteResult> {
  const clean = amountInStr.replace(/,/g, "");
  const num = parseFloat(clean);

  // Step 1: Quote TokenIn -> USDC via Kyber on Base
  const kyberStep = await getKyberQuote(
    "base",
    tokenIn.address,
    NARA_V4_CONFIG.base,
    clean,
    tokenIn.decimals,
    6 // USDC decimals
  );

  // Step 2: Quote USDC -> NARA via v4 Hook
  const usdcAmount = kyberStep.amountOutFormatted.replace(/,/g, "");
  const hookStep = await getV4HookQuote(true, usdcAmount);

  const finalOutNum = parseFloat(hookStep.amountOutFormatted.replace(/,/g, ""));
  const rate = num > 0 ? (finalOutNum / num).toFixed(6) : "0";

  return {
    amountOut: hookStep.amountOut,
    amountOutFormatted: hookStep.amountOutFormatted,
    exchangeRate: rate,
    fromUsd: kyberStep.fromUsd,
    toUsd: hookStep.toUsd,
    routeType: "composite",
    routeLabel: `${tokenIn.symbol} → USDC (Kyber) → NARA (v4 Hook)`,
    gasEstimate: "< 0.0002 ETH",
  };
}

/**
 * Unified Quote Dispatcher:
 * Automatically uses the canonical Uniswap v4 Hook for USDC <-> NARA,
 * composite routing for any Token -> NARA, and Kyber multi-chain routing for general swaps.
 */
export async function getUnifiedQuote(
  chainSlug: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountInStr: string
): Promise<UnifiedQuoteResult> {
  const isBase = chainSlug === "base" || tokenIn.chainId === 8453;
  const isUsdcIn = tokenIn.address.toLowerCase() === NARA_V4_CONFIG.base.toLowerCase();
  const isNaraIn = tokenIn.address.toLowerCase() === NARA_V4_CONFIG.token.toLowerCase();
  const isUsdcOut = tokenOut.address.toLowerCase() === NARA_V4_CONFIG.base.toLowerCase();
  const isNaraOut = tokenOut.address.toLowerCase() === NARA_V4_CONFIG.token.toLowerCase();

  // 1. Direct USDC -> NARA on Base (Canonical Hook)
  if (isBase && isUsdcIn && isNaraOut) {
    return await getV4HookQuote(true, amountInStr);
  }

  // 2. Direct NARA -> USDC on Base (Canonical Hook)
  if (isBase && isNaraIn && isUsdcOut) {
    return await getV4HookQuote(false, amountInStr);
  }

  // 3. TokenIn -> NARA on Base (Composite: TokenIn -> USDC -> NARA)
  if (isBase && !isUsdcIn && isNaraOut) {
    try {
      return await getCompositeTokenToNaraQuote(tokenIn, amountInStr);
    } catch {
      // Fallback directly to Kyber
      return await getKyberQuote(chainSlug, tokenIn.address, tokenOut.address, amountInStr, tokenIn.decimals, tokenOut.decimals);
    }
  }

  // 4. Standard Kyber Aggregator Route (Any token to any token, any chain)
  return await getKyberQuote(
    chainSlug,
    tokenIn.address,
    tokenOut.address,
    amountInStr,
    tokenIn.decimals,
    tokenOut.decimals
  );
}

/**
 * Builds the atomic Universal Router calldata for a single Uniswap v4 Hook swap.
 */
export function buildV4SwapCall(
  isBuy: boolean, // true: USDC -> NARA, false: NARA -> USDC
  amountInWei: ethers.BigNumberish,
  minAmountOutWei: ethers.BigNumberish = 0
): { commands: string; inputs: string[] } {
  const abi = ethers.utils.defaultAbiCoder;
  const tokenIn = isBuy ? NARA_V4_CONFIG.base : NARA_V4_CONFIG.token;
  const tokenOut = isBuy ? NARA_V4_CONFIG.token : NARA_V4_CONFIG.base;

  const swapParams = abi.encode(
    [
      "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ],
    [
      [
        [NARA_V4_CONFIG.base, NARA_V4_CONFIG.token, NARA_V4_CONFIG.fee, NARA_V4_CONFIG.tickSpacing, NARA_V4_CONFIG.hook],
        isBuy, // zeroForOne: true for USDC -> NARA
        amountInWei,
        minAmountOutWei,
        "0x",
      ],
    ]
  );

  const settleParams = abi.encode(["address", "uint256"], [tokenIn, amountInWei]);
  const takeParams = abi.encode(["address", "uint256"], [tokenOut, minAmountOutWei]);

  const actions = ethers.utils.hexlify(
    new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL])
  );
  const actionParams = [swapParams, settleParams, takeParams];
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, actionParams]);

  return {
    commands: ethers.utils.hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
  };
}
