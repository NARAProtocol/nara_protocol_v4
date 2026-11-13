// Cloudflare Pages Function: /api/quote
// Read-only Base Mainnet (8453) live Uniswap v4 NARA V5 Hook spot & swap quote endpoint.
//
// Supported queries:
//   GET /api/quote?summary=1
//   GET /api/quote?direction=buy&asset=ETH&amount=0.01&slippageBps=2000
//   GET /api/quote?direction=buy&asset=USDC&amount=100&slippageBps=2000
//   GET /api/quote?direction=sell&asset=NARA&amount=0.05&slippageBps=2000

import {
  resolveRpcUrls,
  jsonResponse,
  methodNotAllowedResponse,
  optionsResponse,
} from "../_shared/supplyCore.js";
import {
  V4_SWAP_CONSTANTS,
  parseUnits,
  encodeTradingPausedCall,
  decodeBoolResult,
  encodeSlot0ExtsloadCall,
  decodeSlot0UsdPerNara,
  quoteLiveV4Swap,
} from "../../src/meme/v4SwapEngine.js";

const QUOTE_CACHE_HEADER = "public, max-age=5, s-maxage=8, stale-while-revalidate=20";
const SUMMARY_CACHE_HEADER = "public, max-age=10, s-maxage=15, stale-while-revalidate=45";
const RPC_TIMEOUT_MS = 3500;

const BOUNDS = Object.freeze({
  ETH: { decimals: 18, minWei: 10_000_000_000_000n, maxWei: 1_000n * 10n ** 18n, label: "0.00001 to 1,000 ETH" },
  USDC: { decimals: 6, minWei: 50_000n, maxWei: 2_000_000n * 10n ** 6n, label: "0.05 to 2,000,000 USDC" },
  NARA: { decimals: 18, minWei: 10_000_000_000_000n, maxWei: 1_000_000n * 10n ** 18n, label: "0.00001 to 1,000,000 NARA" },
});

class ContractRevertError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractRevertError";
  }
}

async function ethCallSingleRpc(rpcUrl, to, data, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "nara-landing/1.0" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const payload = await res.json();
    if (payload?.error) {
      const msg = String(payload.error.message || "");
      if (payload.error.code === 3 || /execution reverted|vm exception|revert/i.test(msg)) {
        throw new ContractRevertError(msg || "execution_reverted");
      }
      throw new Error(`rpc_err_${payload.error.code ?? "unknown"}`);
    }
    if (typeof payload?.result !== "string" || !payload.result.startsWith("0x") || payload.result.length < 66) {
      throw new Error("rpc_empty_result");
    }
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

export function createFailoverEthCall(rpcUrls, fetchImpl = globalThis.fetch) {
  let preferredIdx = 0;
  return async function ethCall(to, data) {
    let lastErr = null;
    for (let offset = 0; offset < rpcUrls.length; offset++) {
      const idx = (preferredIdx + offset) % rpcUrls.length;
      const rpcUrl = rpcUrls[idx];
      try {
        const res = await ethCallSingleRpc(rpcUrl, to, data, fetchImpl);
        preferredIdx = idx;
        return res;
      } catch (err) {
        if (err instanceof ContractRevertError) throw err;
        lastErr = err;
      }
    }
    throw lastErr || new Error("all_base_rpcs_failed");
  };
}

export async function handleQuoteRequest(request, env, fetchImpl = globalThis.fetch) {
  const url = new URL(request.url);
  const rpcUrls = resolveRpcUrls(env);
  const ethCall = createFailoverEthCall(rpcUrls, fetchImpl);

  const isSummary =
    url.searchParams.get("summary") === "1" ||
    (!url.searchParams.has("amount") && !url.searchParams.has("direction"));

  if (isSummary) {
    try {
      const [pausedHex, slot0Hex] = await Promise.all([
        ethCall(V4_SWAP_CONSTANTS.hook, encodeTradingPausedCall()),
        ethCall(V4_SWAP_CONSTANTS.poolManager, encodeSlot0ExtsloadCall()).catch(() => null),
      ]);
      const tradingPaused = decodeBoolResult(pausedHex);
      const spotUsdPerNara = slot0Hex ? decodeSlot0UsdPerNara(slot0Hex) : null;
      return jsonResponse(
        {
          chainId: V4_SWAP_CONSTANTS.chainId,
          tradingOpen: !tradingPaused,
          spotUsdPerNara,
          hookFeeBps: 463,
          lpFeeBps: 30,
          poolId: V4_SWAP_CONSTANTS.poolId,
          hook: V4_SWAP_CONSTANTS.hook,
          token: V4_SWAP_CONSTANTS.nara,
        },
        200,
        SUMMARY_CACHE_HEADER
      );
    } catch {
      return jsonResponse({ error: "upstream_rpc_unavailable" }, 503);
    }
  }

  const rawDir = (url.searchParams.get("direction") || "buy").trim().toLowerCase();
  if (rawDir !== "buy" && rawDir !== "sell") {
    return jsonResponse({ error: "invalid_direction", message: "direction must be buy or sell." }, 400);
  }

  const rawAsset = (url.searchParams.get("asset") || (rawDir === "sell" ? "NARA" : "ETH"))
    .trim()
    .toUpperCase();
  const payAsset = rawDir === "sell" ? "NARA" : rawAsset;
  if (rawDir === "buy" && payAsset !== "ETH" && payAsset !== "USDC") {
    return jsonResponse({ error: "invalid_asset", message: "buy asset must be ETH or USDC." }, 400);
  }
  if (rawDir === "sell" && rawAsset !== "NARA") {
    return jsonResponse({ error: "invalid_asset", message: "sell asset must be NARA." }, 400);
  }

  const amountStr = (url.searchParams.get("amount") || "").trim();
  if (!amountStr || amountStr.length > 36 || !/^\d+(?:\.\d+)?$/.test(amountStr)) {
    return jsonResponse({ error: "invalid_amount", message: "Enter a valid positive decimal amount." }, 400);
  }

  const bound = BOUNDS[payAsset];
  let amountWei;
  try {
    amountWei = parseUnits(amountStr, bound.decimals);
  } catch {
    return jsonResponse({ error: "invalid_amount", message: "Enter a valid positive decimal amount." }, 400);
  }

  if (amountWei < bound.minWei || amountWei > bound.maxWei) {
    return jsonResponse(
      {
        error: "amount_out_of_bounds",
        message: `Amount must be between ${bound.label}.`,
      },
      400
    );
  }

  const rawSlippage = url.searchParams.get("slippageBps");
  const slippageBps = rawSlippage !== null ? Number(rawSlippage) : V4_SWAP_CONSTANTS.defaultSlippageBps;

  try {
    const quote = await quoteLiveV4Swap({
      direction: rawDir,
      asset: payAsset,
      amountStr,
      slippageBps,
      ethCall,
    });
    return jsonResponse(quote, 200, QUOTE_CACHE_HEADER);
  } catch (err) {
    if (err instanceof ContractRevertError) {
      return jsonResponse(
        {
          error: "quote_reverted",
          message: "Amount exceeds available pool liquidity or minimum swap threshold.",
        },
        422
      );
    }
    return jsonResponse({ error: "upstream_rpc_unavailable" }, 503);
  }
}

export async function onRequestGet({ request, env }) {
  return handleQuoteRequest(request, env);
}

export async function onRequestHead(ctx) {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "GET") return onRequestGet(ctx);
  if (m === "HEAD") return onRequestHead(ctx);
  if (m === "OPTIONS") return onRequestOptions();
  return methodNotAllowedResponse();
}
