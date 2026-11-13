// Shared Base Mainnet on-chain supply reader for:
//   /api/circulating-supply  (plain-text decimal number for CoinGecko / CoinMarketCap / trackers)
//   /api/total-supply        (plain-text decimal number)
//   /api/supply              (full JSON breakdown)
//
// Methodology (default mode):
//   circulatingSupply = totalSupply
//                     - balanceOf(NARAEmissionReserveV5)
//                     - balanceOf(LegacyNARATreasuryRangeManagerV5)
//                     - balanceOf(ActiveNARATreasuryRangeManagerV5)
//                     - unbought NARA inside ActiveNARATreasuryRangeManagerV5 Uniswap v4 range orders
//                     - balanceOf(0x000000000000000000000000000000000000dEaD)
//                     - sum(principal of active non-early-exitable commitments in NARAPrincipalLedgerV5
//                           whose commitment duration > 1 day AND remaining time > 1 day)
//
// Short 1-day commitments (duration <= 96 epochs or <= 96 epochs remaining to maturity),
// all unclaimed rewards in NARARewardLedgerV5, all redeemable payment slips in CryptoSlipVaultV32 (v32 + v33),
// Treasury Safe multisig balances, market-making pool liquidity, and wallet balances remain in Circulating Supply.

export const CHAIN_ID = 8453;
export const DECIMALS = 18n;
export const WAD = 10n ** DECIMALS;
export const EPOCHS_PER_DAY = 96n; // 96 * 15m = 24h
const Q96 = 1n << 96n;

export const ADDRESSES = Object.freeze({
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  naraToken: "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f",
  emissionReserve: "0xf932178F24b0813C82093985F0Af6Db27Ae25930",
  legacyRangeManager: "0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288",
  activeRangeManager: "0x221c625d2BC416460C397035C1286C1f4A4D3A7C",
  uniV4StateView: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
  uniV4PoolId: "0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f",
  deadBurn: "0x000000000000000000000000000000000000dEaD",
  epochEngine: "0xd93FbEbFb33FAc9288125074625D4750573B1a53",
  principalLedger: "0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2",
  rewardLedger: "0xC72671D9438388638547444524F6542b650C9264",
  slipVault: "0x38BF0321FA7489576978353a6a8da4A3e85C2F18",
  slipVaultV33: "0x3f80aa68Fb4834d6E119EE1cf932C14419Cf63EB",
  treasurySafe: "0xe320C281c86079eA85f2Bc67864E873A61D551E3",
});

export const DEFAULT_RPC_URLS = Object.freeze([
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
]);

const SEL_AGGREGATE = "252dba42"; // aggregate((address,bytes)[])
const SEL_TOTAL_SUPPLY = "18160ddd"; // totalSupply()
const SEL_BALANCE_OF = "70a08231"; // balanceOf(address)
const SEL_CLOCK = "91ddadf4"; // clock()
const SEL_PRINCIPAL_ACCOUNTING = "ccad7a2f"; // principalAccounting()
const SEL_POSITION_HEAD = "9c82fd33"; // positionHead(uint256)
const SEL_GET_SLOT0 = "c815641c"; // getSlot0(bytes32)
const SEL_GET_ACTIVE_ORDER_IDS = "52fe5437"; // getActiveOrderIds(uint256,uint256)
const SEL_GET_ORDER = "d09ef241"; // getOrder(uint256)

const POSITION_CHUNK_SIZE = 500;
const MAX_POSITIONS_SCAN = 10000;
const RANGE_ORDER_PAGE_SIZE = 100;
const MAX_RANGE_ORDERS_SCAN = 1000;
const RPC_TIMEOUT_MS = 6000;

// Exact Uniswap TickMath.getSqrtPriceAtTick multipliers (Q128 fixed-point)
const SQRT_PRICE_MULTIPLIERS = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];

export function getSqrtPriceX96AtTick(tick) {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887272) {
    throw new Error(`invalid_tick_${tick}`);
  }
  const absTick = Math.abs(tick);
  let ratio = 1n << 128n;
  for (let bit = 0; bit < SQRT_PRICE_MULTIPLIERS.length; bit++) {
    if ((absTick & (1 << bit)) !== 0) {
      ratio = (ratio * SQRT_PRICE_MULTIPLIERS[bit]) >> 128n;
    }
  }
  if (tick > 0) {
    ratio = ((1n << 256n) - 1n) / ratio;
  }
  return (ratio + (1n << 32n) - 1n) >> 32n;
}

// Computes exact token1 (NARA) reserves inside a Uniswap v4 concentrated position
// for the canonical USDC (token0) / NARA (token1) pool.
export function computeOrderNaraWei(liquidity, tickLower, tickUpper, sqrtPriceX96) {
  const L = BigInt(liquidity);
  if (L <= 0n) return 0n;
  const lo = Math.min(Number(tickLower), Number(tickUpper));
  const hi = Math.max(Number(tickLower), Number(tickUpper));
  const sa = getSqrtPriceX96AtTick(lo);
  const sb = getSqrtPriceX96AtTick(hi);
  const sp = BigInt(sqrtPriceX96);

  if (sp <= sa) return 0n;
  if (sp < sb) return (L * (sp - sa)) / Q96;
  return (L * (sb - sa)) / Q96;
}

const COMMON_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

export const SUPPLY_CACHE_HEADER = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";

export function textResponse(body, status = 200, cacheControl = SUPPLY_CACHE_HEADER) {
  return new Response(body, {
    status,
    headers: {
      ...COMMON_SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": status === 200 ? cacheControl : "no-store",
    },
  });
}

export function jsonResponse(body, status = 200, cacheControl = SUPPLY_CACHE_HEADER) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...COMMON_SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? cacheControl : "no-store",
    },
  });
}

export function methodNotAllowedResponse() {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      ...COMMON_SECURITY_HEADERS,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function padWordHex(hexNoPrefix) {
  return hexNoPrefix.padStart(64, "0");
}

function cleanHex(hex) {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2).toLowerCase() : hex.toLowerCase();
}

export function encodeBalanceOf(addr) {
  return "0x" + SEL_BALANCE_OF + padWordHex(cleanHex(addr));
}

export function encodePositionHead(id) {
  return "0x" + SEL_POSITION_HEAD + BigInt(id).toString(16).padStart(64, "0");
}

export function encodeGetSlot0(poolId) {
  return "0x" + SEL_GET_SLOT0 + padWordHex(cleanHex(poolId));
}

export function encodeGetActiveOrderIds(offset, limit) {
  return (
    "0x" +
    SEL_GET_ACTIVE_ORDER_IDS +
    BigInt(offset).toString(16).padStart(64, "0") +
    BigInt(limit).toString(16).padStart(64, "0")
  );
}

export function encodeGetOrder(orderId) {
  return "0x" + SEL_GET_ORDER + BigInt(orderId).toString(16).padStart(64, "0");
}

export function decodeActiveOrderIdsPage(rawHex) {
  const words = decodeWords(rawHex, 3);
  const nextOffset = Number(words[1]);
  const length = Number(words[2]);
  const orderIds = [];
  for (let i = 0; i < length && 3 + i < words.length; i++) {
    orderIds.push(words[3 + i]);
  }
  return { orderIds, nextOffset };
}

// Encodes Multicall3.aggregate((address target, bytes callData)[] calls)
export function encodeMulticallAggregate(calls) {
  const n = calls.length;
  const encodedElements = calls.map(({ target, callData }) => {
    const addrWord = padWordHex(cleanHex(target));
    const dataHex = cleanHex(callData);
    const byteLen = dataHex.length / 2;
    const paddedLen = Math.ceil(byteLen / 32) * 64;
    const dataPadded = dataHex.padEnd(paddedLen, "0");
    return (
      addrWord +
      padWordHex("40") + // offset to bytes within (address, bytes)
      padWordHex(byteLen.toString(16)) +
      dataPadded
    );
  });

  // Relative offsets from the start of the array payload (after length word):
  // First N words are the offsets themselves (N * 32 bytes), followed each encoded element.
  let runningOffset = n * 32;
  const offsetWords = [];
  for (const el of encodedElements) {
    offsetWords.push(padWordHex(runningOffset.toString(16)));
    runningOffset += el.length / 2;
  }

  return (
    "0x" +
    SEL_AGGREGATE +
    padWordHex("20") +
    padWordHex(n.toString(16)) +
    offsetWords.join("") +
    encodedElements.join("")
  );
}

function readUint256At(hexNoPrefix, byteOffset) {
  const start = byteOffset * 2;
  const slice = hexNoPrefix.slice(start, start + 64);
  if (slice.length !== 64) throw new Error("abi_truncated_word");
  return BigInt("0x" + slice);
}

// Decodes Multicall3.aggregate return: (uint256 blockNumber, bytes[] returnData)
export function decodeMulticallAggregate(rawHex) {
  const hex = cleanHex(rawHex);
  if (hex.length < 192) throw new Error("abi_short_aggregate_response");

  const blockNumber = readUint256At(hex, 0);
  const arrayOffset = Number(readUint256At(hex, 32));
  const length = Number(readUint256At(hex, arrayOffset));
  const elementsBase = arrayOffset + 32;

  const results = [];
  for (let i = 0; i < length; i++) {
    const relOffset = Number(readUint256At(hex, elementsBase + i * 32));
    const itemPos = elementsBase + relOffset;
    const byteLen = Number(readUint256At(hex, itemPos));
    const dataStart = (itemPos + 32) * 2;
    const dataEnd = dataStart + byteLen * 2;
    if (dataEnd > hex.length) throw new Error("abi_truncated_bytes_item");
    results.push("0x" + hex.slice(dataStart, dataEnd));
  }

  return { blockNumber, results };
}

export function decodeWords(rawHex, expectedMinWords = 1) {
  const hex = cleanHex(rawHex);
  if (hex.length < expectedMinWords * 64) throw new Error("abi_unexpected_return_length");
  const words = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) {
    words.push(BigInt("0x" + hex.slice(i, i + 64)));
  }
  return words;
}

// Formats 18-decimal wei BigInt as exact decimal string without trailing fractional zeros
// (e.g. 1000000000000000000000000n -> "1000000", 22922429211728408615n -> "22.922429211728408615").
export function formatUnits18(wei) {
  const v = BigInt(wei);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / WAD;
  const frac = abs % WAD;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}

export function resolveRpcUrls(env) {
  const urls = [];
  if (env && typeof env.BASE_RPC_URL === "string" && env.BASE_RPC_URL.trim().startsWith("https://")) {
    urls.push(env.BASE_RPC_URL.trim());
  }
  for (const u of DEFAULT_RPC_URLS) {
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

async function ethCallSingleRpc(rpcUrl, to, data, blockTag = "latest", fetchImpl = globalThis.fetch) {
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
        params: [{ to, data }, blockTag],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const payload = await res.json();
    if (payload?.error) throw new Error(`rpc_err_${payload.error.code ?? "unknown"}`);
    if (typeof payload?.result !== "string" || !payload.result.startsWith("0x") || payload.result.length < 66) {
      throw new Error("rpc_empty_result");
    }
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function multicallWithFallback(rpcUrls, calls, blockTag = "latest", fetchImpl = globalThis.fetch) {
  const callData = encodeMulticallAggregate(calls);
  let lastErr = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const raw = await ethCallSingleRpc(rpcUrl, ADDRESSES.multicall3, callData, blockTag, fetchImpl);
      return { ...decodeMulticallAggregate(raw), rpcUrl };
    } catch (err) {
      // If a pinned historical blockTag failed on a pruned node, retry "latest" once on the same node
      if (blockTag !== "latest") {
        try {
          const rawLatest = await ethCallSingleRpc(rpcUrl, ADDRESSES.multicall3, callData, "latest", fetchImpl);
          return { ...decodeMulticallAggregate(rawLatest), rpcUrl };
        } catch (err2) {
          lastErr = err2;
          continue;
        }
      }
      lastErr = err;
    }
  }
  throw lastErr || new Error("all_rpcs_failed");
}

// Evaluates whether a NARAPrincipalLedgerV5 position Head is committed for strictly > 1 day.
// positionHead words:
//   [0] generationOwner, [1] generation, [2] createdEpoch, [3] activation,
//   [4] maturity, [5] effectiveEnd, [6] duration, [7] principal,
//   [8] modelWeight, [9] rewardWeight, [10] earlyExitEnabled, [11] earlyExitBps,
//   [12] penalty, [13] penaltyCapacityReserved, [14] withdrawn, [15] termsHash
export function classifyPositionHead(words, wallEpoch, minLockEpochs = EPOCHS_PER_DAY) {
  const maturity = words[4];
  const duration = words[6];
  const principal = words[7];
  const earlyExitEnabled = words[10] !== 0n;
  const withdrawn = words[14] !== 0n;

  if (withdrawn || principal === 0n) {
    return { active: false, lockedOverThreshold: false, principal: 0n, duration, maturity, earlyExitEnabled };
  }

  const remainingEpochs = maturity > wallEpoch ? maturity - wallEpoch : 0n;
  const lockedOverThreshold = !earlyExitEnabled && duration > minLockEpochs && remainingEpochs > minLockEpochs;
  return {
    active: true,
    lockedOverThreshold,
    principal,
    duration,
    maturity,
    remainingEpochs,
    earlyExitEnabled,
  };
}

export async function readSupplySnapshot(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const rpcUrls = resolveRpcUrls(env);

  const baseCalls = [
    { target: ADDRESSES.naraToken, callData: "0x" + SEL_TOTAL_SUPPLY },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.emissionReserve) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.legacyRangeManager) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.activeRangeManager) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.deadBurn) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.rewardLedger) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.principalLedger) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.slipVault) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.slipVaultV33) },
    { target: ADDRESSES.naraToken, callData: encodeBalanceOf(ADDRESSES.treasurySafe) },
    { target: ADDRESSES.epochEngine, callData: "0x" + SEL_CLOCK },
    { target: ADDRESSES.principalLedger, callData: "0x" + SEL_PRINCIPAL_ACCOUNTING },
    { target: ADDRESSES.uniV4StateView, callData: encodeGetSlot0(ADDRESSES.uniV4PoolId) },
    { target: ADDRESSES.activeRangeManager, callData: encodeGetActiveOrderIds(0, RANGE_ORDER_PAGE_SIZE) },
  ];

  const first = await multicallWithFallback(rpcUrls, baseCalls, "latest", fetchImpl);
  const r = first.results;
  const pinnedBlockTag = "0x" + first.blockNumber.toString(16);

  const rawTotalSupply = decodeWords(r[0], 1)[0];
  const emissionReserveBal = decodeWords(r[1], 1)[0];
  const legacyRangeBal = decodeWords(r[2], 1)[0];
  const activeRangeBal = decodeWords(r[3], 1)[0];
  const deadBurnBal = decodeWords(r[4], 1)[0];
  const rewardLedgerBal = decodeWords(r[5], 1)[0];
  const principalLedgerBal = decodeWords(r[6], 1)[0];
  const slipVaultV32Bal = decodeWords(r[7], 1)[0];
  const slipVaultV33Bal = decodeWords(r[8], 1)[0];
  const totalSlipVaultsBal = slipVaultV32Bal + slipVaultV33Bal;
  const treasurySafeBal = decodeWords(r[9], 1)[0];

  const clockWords = decodeWords(r[10], 6);
  const wallEpoch = clockWords[2];

  const pAccWords = decodeWords(r[11], 8);
  const rawPositionCount = Number(pAccWords[7]);
  const positionCount = Math.min(Math.max(0, rawPositionCount), MAX_POSITIONS_SCAN);

  const slot0Words = decodeWords(r[12], 4);
  const sqrtPriceX96 = slot0Words[0];

  const firstOrderPage = decodeActiveOrderIdsPage(r[13]);
  const allActiveOrderIds = [...firstOrderPage.orderIds];
  let nextOrderOffset = firstOrderPage.nextOffset;

  while (
    firstOrderPage.orderIds.length === RANGE_ORDER_PAGE_SIZE &&
    allActiveOrderIds.length < MAX_RANGE_ORDERS_SCAN
  ) {
    const pageBatch = await multicallWithFallback(
      rpcUrls,
      [{ target: ADDRESSES.activeRangeManager, callData: encodeGetActiveOrderIds(nextOrderOffset, RANGE_ORDER_PAGE_SIZE) }],
      pinnedBlockTag,
      fetchImpl,
    );
    const page = decodeActiveOrderIdsPage(pageBatch.results[0]);
    if (page.orderIds.length === 0) break;
    for (const id of page.orderIds) {
      if (allActiveOrderIds.length >= MAX_RANGE_ORDERS_SCAN) break;
      allActiveOrderIds.push(id);
    }
    if (page.orderIds.length < RANGE_ORDER_PAGE_SIZE) break;
    nextOrderOffset = page.nextOffset;
  }

  let lockedOver1dWei = 0n;
  let circulating1dOrMaturedWei = 0n;
  const lockedPositionIds = [];
  const circulatingPositionIds = [];
  let activeRangeOrderNaraWei = 0n;

  const needPositions = positionCount > 0 && principalLedgerBal > 0n;
  const needRangeOrders = allActiveOrderIds.length > 0 && sqrtPriceX96 > 0n;

  if (needPositions || needRangeOrders) {
    // When positions fit in the first chunk, fetch positionHead(1..N) and getOrder(...) in one single Multicall3 round-trip.
    const firstPosEnd = needPositions ? Math.min(positionCount, POSITION_CHUNK_SIZE) : 0;
    const combinedCalls = [];
    for (let id = 1; id <= firstPosEnd; id++) {
      combinedCalls.push({ target: ADDRESSES.principalLedger, callData: encodePositionHead(id) });
    }
    if (needRangeOrders) {
      for (const orderId of allActiveOrderIds) {
        combinedCalls.push({ target: ADDRESSES.activeRangeManager, callData: encodeGetOrder(orderId) });
      }
    }

    if (combinedCalls.length > 0) {
      const batch = await multicallWithFallback(rpcUrls, combinedCalls, pinnedBlockTag, fetchImpl);
      for (let idx = 0; idx < firstPosEnd; idx++) {
        const positionId = 1 + idx;
        const words = decodeWords(batch.results[idx], 16);
        const info = classifyPositionHead(words, wallEpoch, EPOCHS_PER_DAY);
        if (!info.active) continue;
        if (info.lockedOverThreshold) {
          lockedOver1dWei += info.principal;
          lockedPositionIds.push(positionId);
        } else {
          circulating1dOrMaturedWei += info.principal;
          circulatingPositionIds.push(positionId);
        }
      }

      if (needRangeOrders) {
        for (let j = 0; j < allActiveOrderIds.length; j++) {
          const orderWords = decodeWords(batch.results[firstPosEnd + j], 13);
          const status = orderWords[12];
          if (status !== 1n) continue; // OrderStatus.Active == 1
          const liquidity = orderWords[5];
          const tickLower = Number(BigInt.asIntN(24, orderWords[6]));
          const tickUpper = Number(BigInt.asIntN(24, orderWords[7]));
          activeRangeOrderNaraWei += computeOrderNaraWei(liquidity, tickLower, tickUpper, sqrtPriceX96);
        }
      }
    }

    // Scan any remaining position chunks (> 500)
    if (needPositions && positionCount > firstPosEnd) {
      for (let start = firstPosEnd + 1; start <= positionCount; start += POSITION_CHUNK_SIZE) {
        const end = Math.min(positionCount, start + POSITION_CHUNK_SIZE - 1);
        const posCalls = [];
        for (let id = start; id <= end; id++) {
          posCalls.push({ target: ADDRESSES.principalLedger, callData: encodePositionHead(id) });
        }
        const batch = await multicallWithFallback(rpcUrls, posCalls, pinnedBlockTag, fetchImpl);
        for (let idx = 0; idx < batch.results.length; idx++) {
          const positionId = start + idx;
          const words = decodeWords(batch.results[idx], 16);
          const info = classifyPositionHead(words, wallEpoch, EPOCHS_PER_DAY);
          if (!info.active) continue;
          if (info.lockedOverThreshold) {
            lockedOver1dWei += info.principal;
            lockedPositionIds.push(positionId);
          } else {
            circulating1dOrMaturedWei += info.principal;
            circulatingPositionIds.push(positionId);
          }
        }
      }
    }
  }

  // Safety invariant: never deduct more staked principal than NARAPrincipalLedgerV5 actually holds on-chain.
  if (lockedOver1dWei > principalLedgerBal) {
    lockedOver1dWei = principalLedgerBal;
  }
  const untradableShortOrResidualPrincipalWei =
    principalLedgerBal > lockedOver1dWei ? principalLedgerBal - lockedOver1dWei : 0n;

  const netTotalSupplyWei = rawTotalSupply > deadBurnBal ? rawTotalSupply - deadBurnBal : 0n;
  const protocolVaultsLockedWei =
    emissionReserveBal + legacyRangeBal + activeRangeBal + activeRangeOrderNaraWei;
  const protocolAndBurnLockedWei = protocolVaultsLockedWei + deadBurnBal;

  const protocolOnlyCirculatingWei =
    rawTotalSupply > protocolAndBurnLockedWei ? rawTotalSupply - protocolAndBurnLockedWei : 0n;

  const totalExcludedWei = protocolAndBurnLockedWei + lockedOver1dWei;
  const circulatingSupplyWei = rawTotalSupply > totalExcludedWei ? rawTotalSupply - totalExcludedWei : 0n;

  const accountedCirculatingBuckets =
    rewardLedgerBal + untradableShortOrResidualPrincipalWei + totalSlipVaultsBal + treasurySafeBal;
  const walletsAndPoolsFloatWei =
    circulatingSupplyWei > accountedCirculatingBuckets ? circulatingSupplyWei - accountedCirculatingBuckets : 0n;

  return {
    token: ADDRESSES.naraToken,
    chainId: CHAIN_ID,
    blockNumber: Number(first.blockNumber),
    wallEpoch: Number(wallEpoch),
    minLockEpochsExcluded: Number(EPOCHS_PER_DAY),
    updatedAt: new Date().toISOString(),
    rawTotalSupplyWei: rawTotalSupply,
    netTotalSupplyWei,
    circulatingSupplyWei,
    protocolOnlyCirculatingWei,
    lockedSupplyWei: totalExcludedWei,
    totalSupply: formatUnits18(netTotalSupplyWei),
    rawTotalSupply: formatUnits18(rawTotalSupply),
    circulatingSupply: formatUnits18(circulatingSupplyWei),
    protocolOnlyCirculatingSupply: formatUnits18(protocolOnlyCirculatingWei),
    lockedSupply: formatUnits18(totalExcludedWei),
    breakdown: {
      protocolLocked: {
        emissionReserve: { address: ADDRESSES.emissionReserve, balance: formatUnits18(emissionReserveBal) },
        legacyRangeManager: { address: ADDRESSES.legacyRangeManager, balance: formatUnits18(legacyRangeBal) },
        activeRangeManager: { address: ADDRESSES.activeRangeManager, balance: formatUnits18(activeRangeBal) },
        activeRangeManagerPoolOrders: {
          address: ADDRESSES.activeRangeManager,
          poolId: ADDRESSES.uniV4PoolId,
          activeOrders: allActiveOrderIds.length,
          balance: formatUnits18(activeRangeOrderNaraWei),
        },
        deadBurn: { address: ADDRESSES.deadBurn, balance: formatUnits18(deadBurnBal) },
        subtotal: formatUnits18(protocolAndBurnLockedWei),
      },
      commitments: {
        principalLedgerAddress: ADDRESSES.principalLedger,
        principalLedgerBalance: formatUnits18(principalLedgerBal),
        lockedOver1d: formatUnits18(lockedOver1dWei),
        circulating1dOrMatured: formatUnits18(untradableShortOrResidualPrincipalWei),
        positionsScanned: positionCount,
        lockedPositionIds,
        circulatingPositionIds,
      },
      includedInCirculating: {
        unclaimedRewardsInLedger: { address: ADDRESSES.rewardLedger, balance: formatUnits18(rewardLedgerBal) },
        shortOrMaturedCommitments: formatUnits18(untradableShortOrResidualPrincipalWei),
        activePaymentSlipsInVault: {
          address: ADDRESSES.slipVaultV33,
          balance: formatUnits18(totalSlipVaultsBal),
          vaults: {
            v33: { address: ADDRESSES.slipVaultV33, balance: formatUnits18(slipVaultV33Bal) },
            v32: { address: ADDRESSES.slipVault, balance: formatUnits18(slipVaultV32Bal) },
          },
          note: "Redeemable payment slips have no maturity freeze and remain in circulating supply",
        },
        treasurySafeMultisig: { address: ADDRESSES.treasurySafe, balance: formatUnits18(treasurySafeBal) },
        walletsAndPoolsFloat: formatUnits18(walletsAndPoolsFloatWei),
      },
    },
  };
}

export function buildPublicSupplyReport(snapshot) {
  const {
    rawTotalSupplyWei: _a,
    netTotalSupplyWei: _b,
    circulatingSupplyWei: _c,
    protocolOnlyCirculatingWei: _d,
    lockedSupplyWei: _e,
    ...publicReport
  } = snapshot;
  return publicReport;
}
