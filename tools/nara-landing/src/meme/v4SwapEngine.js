// Zero-dependency Base Mainnet (8453) Uniswap v4 NARA V5 Hook quote & Universal Router swap engine.
// Shared between Cloudflare Pages Functions (/api/quote) and the naraprotocol.io browser Buy modal.
//
// STRICT ARCHITECTURAL INVARIANT (100% V4-HOOK-ONLY FOR ALL NARA LEGS):
// Every NARA buy or sell encoded here routes the NARA <-> USDC leg 100% exclusively through
// NARALiquidityHookV5 (0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC) on Uniswap v4 PoolManager
// via the canonical Uniswap Universal Router (0x6fF5693b99212Da76ad316178A184AB56D299b43).
// Uniswap v3 (0.05% WETH/USDC) is strictly restricted to the non-NARA ETH -> USDC bridge hop.

export const V4_SWAP_CONSTANTS = Object.freeze({
  chainId: 8453,
  chainIdHex: "0x2105",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  weth: "0x4200000000000000000000000000000000000006",
  nara: "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f",
  hook: "0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  universalRouter: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  v4Quoter: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
  v3QuoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  addressThis: "0x0000000000000000000000000000000000000002",
  poolId: "0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f",
  poolSlot0StorageSlot: "0xd48dab6a7cea17c953b4d53a9aec36d76c68ca67b9a9f3cd34ff29dddf8d1a5e",
  fee: 3000,
  tickSpacing: 60,
  v3WethUsdcFee: 500,
  defaultSlippageBps: 500, // 5.00% MEV-safe default (v4Quoter already deducts live NARALiquidityHookV5 dynamic fee)
  minSlippageBps: 100,
  maxSlippageBps: 5000,
});

const SQRT_PRICE_MASK = (1n << 160n) - 1n;
const USD_MICRO_NUMERATOR = 10n ** 18n << 192n;
const MAX_UINT128 = (1n << 128n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;

// --- Pure BigInt Decimal & Hex Helpers ---

export function strip0x(hex) {
  const s = String(hex || "").trim();
  return s.startsWith("0x") || s.startsWith("0X") ? s.slice(2).toLowerCase() : s.toLowerCase();
}

export function isValidAddress(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

export function abiWordU256(value) {
  const v = BigInt(value);
  if (v < 0n || v > MAX_UINT256) throw new Error("uint256 out of range");
  return v.toString(16).padStart(64, "0");
}

export function abiWordAddr(addr) {
  if (!isValidAddress(addr)) throw new Error(`invalid address: ${addr}`);
  return strip0x(addr).padStart(64, "0");
}

export function abiWordBool(flag) {
  return flag ? abiWordU256(1n) : abiWordU256(0n);
}

export function abiRightPadBytes(rawHexNoPrefix) {
  const clean = strip0x(rawHexNoPrefix);
  if (clean.length % 2 !== 0) throw new Error("odd hex byte length");
  const byteLen = clean.length / 2;
  const paddedHexLen = Math.ceil(byteLen / 32) * 64;
  return abiWordU256(byteLen) + (paddedHexLen > 0 ? clean.padEnd(paddedHexLen, "0") : "");
}

export function abiEncodeBytesArray(elementsHexNoPrefix) {
  const encodedEls = elementsHexNoPrefix.map((h) => abiRightPadBytes(h));
  const n = encodedEls.length;
  let offset = n * 32;
  const offsets = [];
  for (const el of encodedEls) {
    offsets.push(abiWordU256(offset));
    offset += el.length / 2;
  }
  return abiWordU256(n) + offsets.join("") + encodedEls.join("");
}

export function parseUnits(amountStr, decimals) {
  let raw = String(amountStr ?? "").trim();
  if (raw.startsWith(".")) raw = "0" + raw;
  if (raw.endsWith(".")) raw = raw.slice(0, -1);
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("Invalid numeric amount");
  const [wholePart, fracPart = ""] = raw.split(".");
  const d = Number(decimals);
  const trimmedFrac = fracPart.slice(0, d).padEnd(d, "0");
  return BigInt(wholePart) * 10n ** BigInt(d) + BigInt(trimmedFrac || "0");
}

export function formatUnits(wei, decimals) {
  const v = BigInt(wei);
  const d = Number(decimals);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(d);
  const whole = abs / base;
  const rem = abs % base;
  if (rem === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  const frac = rem.toString().padStart(d, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export function formatDisplayNara(wei) {
  const num = Number(formatUnits(wei, 18));
  if (!Number.isFinite(num) || num <= 0) return "0";
  if (num >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (num >= 0.000001) return num.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return "<0.000001";
}

export function formatDisplayUsdc(wei) {
  const num = Number(formatUnits(wei, 6));
  if (!Number.isFinite(num) || num <= 0) return "0.00";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Read-Only Contract Calldata & Decoders ---

export function encodeTradingPausedCall() {
  return "0x53e23e2e";
}

export function decodeBoolResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 64) throw new Error("empty bool return");
  return BigInt("0x" + clean.slice(0, 64)) !== 0n;
}

export function encodeSlot0ExtsloadCall() {
  return "0x1e2eaeaf" + strip0x(V4_SWAP_CONSTANTS.poolSlot0StorageSlot).padStart(64, "0");
}

export function decodeSlot0UsdPerNara(hex) {
  const clean = strip0x(hex);
  if (clean.length < 64) return null;
  const word = BigInt("0x" + clean.slice(0, 64));
  const sqrtPriceX96 = word & SQRT_PRICE_MASK;
  if (sqrtPriceX96 <= 0n) return null;
  const microUsd = USD_MICRO_NUMERATOR / (sqrtPriceX96 * sqrtPriceX96);
  if (microUsd <= 0n) return null;
  const usd = Number(microUsd) / 1e6;
  return Number.isFinite(usd) && usd > 0.01 && usd < 1_000_000 ? usd : null;
}

export function encodeHookQuoteGrossCall(currencyAddr, requestedWei) {
  return "0x1a4aea4b" + abiWordAddr(currencyAddr) + abiWordU256(requestedWei);
}

export function decodeHookQuoteGross(hex) {
  const clean = strip0x(hex);
  if (clean.length < 128) throw new Error("invalid quoteGross return");
  const feeWei = BigInt("0x" + clean.slice(0, 64));
  const netWei = BigInt("0x" + clean.slice(64, 128));
  return { feeWei, netWei };
}

export function encodeV4QuoterSingleCall(zeroForOne, exactAmountWei) {
  const amt = BigInt(exactAmountWei);
  if (amt <= 0n || amt > MAX_UINT128) throw new Error("V4 quote amount out of uint128 bounds");
  return (
    "0xaa9d21cb" +
    abiWordU256(0x20n) +
    abiWordAddr(V4_SWAP_CONSTANTS.usdc) +
    abiWordAddr(V4_SWAP_CONSTANTS.nara) +
    abiWordU256(V4_SWAP_CONSTANTS.fee) +
    abiWordU256(V4_SWAP_CONSTANTS.tickSpacing) +
    abiWordAddr(V4_SWAP_CONSTANTS.hook) +
    abiWordBool(zeroForOne) +
    abiWordU256(amt) +
    abiWordU256(0x100n) +
    abiWordU256(0n)
  );
}

export function encodeV3WethToUsdcQuoterCall(wethAmountWei) {
  return (
    "0xc6a5026a" +
    abiWordAddr(V4_SWAP_CONSTANTS.weth) +
    abiWordAddr(V4_SWAP_CONSTANTS.usdc) +
    abiWordU256(wethAmountWei) +
    abiWordU256(V4_SWAP_CONSTANTS.v3WethUsdcFee) +
    abiWordU256(0n)
  );
}

export function decodeFirstUint256(hex) {
  const clean = strip0x(hex);
  if (clean.length < 64) throw new Error("empty uint256 return");
  return BigInt("0x" + clean.slice(0, 64));
}

// --- ERC-20 & Permit2 Calldata ---

export function encodeErc20BalanceOf(owner) {
  return "0x70a08231" + abiWordAddr(owner);
}

export function encodeErc20Allowance(owner, spender) {
  return "0xdd62ed3e" + abiWordAddr(owner) + abiWordAddr(spender);
}

export function encodeErc20Approve(spender, amountWei) {
  return "0x095ea7b3" + abiWordAddr(spender) + abiWordU256(amountWei);
}

export function encodePermit2Allowance(user, token, spender) {
  return "0x927da105" + abiWordAddr(user) + abiWordAddr(token) + abiWordAddr(spender);
}

export function decodePermit2Allowance(hex) {
  const clean = strip0x(hex);
  if (clean.length < 192) return { amount: 0n, expiration: 0 };
  const amount = BigInt("0x" + clean.slice(0, 64));
  const expiration = Number(BigInt("0x" + clean.slice(64, 128)));
  return { amount, expiration };
}

export function encodePermit2Approve(token, spender, amountWei, expirationSec) {
  const amt = BigInt(amountWei);
  const capped = amt > MAX_UINT160 ? MAX_UINT160 : amt;
  const exp = BigInt(Math.floor(Number(expirationSec)));
  return (
    "0x87517c45" +
    abiWordAddr(token) +
    abiWordAddr(spender) +
    abiWordU256(capped) +
    abiWordU256(exp)
  );
}

// --- Canonical Universal Router Calldata Builders (100% V4-Hook-Only) ---

function encodeV4ExactInputSingleParamHex(zeroForOne, amountInWei, minAmountOutWei) {
  const amtIn = BigInt(amountInWei);
  const minOut = BigInt(minAmountOutWei);
  if (amtIn <= 0n || amtIn > MAX_UINT128) throw new Error("swap amountIn out of uint128 bounds");
  if (minOut < 0n || minOut > MAX_UINT128) throw new Error("swap minAmountOut out of uint128 bounds");
  return (
    abiWordU256(0x20n) +
    abiWordAddr(V4_SWAP_CONSTANTS.usdc) +
    abiWordAddr(V4_SWAP_CONSTANTS.nara) +
    abiWordU256(V4_SWAP_CONSTANTS.fee) +
    abiWordU256(V4_SWAP_CONSTANTS.tickSpacing) +
    abiWordAddr(V4_SWAP_CONSTANTS.hook) +
    abiWordBool(zeroForOne) +
    abiWordU256(amtIn) +
    abiWordU256(minOut) +
    abiWordU256(0x120n) +
    abiWordU256(0n)
  );
}

function encodeV4ActionPlanHex(actionsHexNoPrefix, paramHexList) {
  const headOffsetActions = abiWordU256(0x40n);
  const actionsEncoded = abiRightPadBytes(actionsHexNoPrefix);
  const headOffsetParams = abiWordU256(0x40 + actionsEncoded.length / 2);
  const paramsEncoded = abiEncodeBytesArray(paramHexList);
  return headOffsetActions + headOffsetParams + actionsEncoded + paramsEncoded;
}

function encodeUniversalRouterExecute(commandsHexNoPrefix, inputsHexList, deadlineSec) {
  const commandsEncoded = abiRightPadBytes(commandsHexNoPrefix);
  const inputsOffset = 0x60 + commandsEncoded.length / 2;
  const inputsEncoded = abiEncodeBytesArray(inputsHexList);
  return (
    "0x3593564c" +
    abiWordU256(0x60n) +
    abiWordU256(inputsOffset) +
    abiWordU256(BigInt(deadlineSec)) +
    commandsEncoded +
    inputsEncoded
  );
}

/**
 * Atomic 1-Click ETH -> USDC (V3 0.05%) -> NARA (V4 NARA V5 Hook) Universal Router calldata (0x0b001004).
 * Zero ERC-20 approvals required. Matches naraDexRouter.encodeEthToNaraSwapCalldata byte-for-byte.
 */
export function encodeEthToNaraUniversalRouter(
  ethAmountWei,
  dustRecipient,
  minUsdcWei,
  minNaraWei,
  deadlineSec
) {
  if (!isValidAddress(dustRecipient)) throw new Error("Invalid recipient address");
  const wrapInput = abiWordAddr(V4_SWAP_CONSTANTS.addressThis) + abiWordU256(ethAmountWei);

  const v3PathHex =
    strip0x(V4_SWAP_CONSTANTS.weth) +
    V4_SWAP_CONSTANTS.v3WethUsdcFee.toString(16).padStart(6, "0") +
    strip0x(V4_SWAP_CONSTANTS.usdc);

  const v3SwapInput =
    abiWordAddr(V4_SWAP_CONSTANTS.addressThis) +
    abiWordU256(ethAmountWei) +
    abiWordU256(minUsdcWei) +
    abiWordU256(0xa0n) +
    abiWordBool(false) +
    abiRightPadBytes(v3PathHex);

  const swapParams = encodeV4ExactInputSingleParamHex(true, minUsdcWei, minNaraWei);
  const settleParams =
    abiWordAddr(V4_SWAP_CONSTANTS.usdc) + abiWordU256(minUsdcWei) + abiWordBool(false);
  const takeParams = abiWordAddr(V4_SWAP_CONSTANTS.nara) + abiWordU256(minNaraWei);

  const v4Input = encodeV4ActionPlanHex("060b0f", [swapParams, settleParams, takeParams]);
  const sweepInput =
    abiWordAddr(V4_SWAP_CONSTANTS.usdc) + abiWordAddr(dustRecipient) + abiWordU256(0n);

  return {
    to: V4_SWAP_CONSTANTS.universalRouter,
    data: encodeUniversalRouterExecute(
      "0b001004",
      [wrapInput, v3SwapInput, v4Input, sweepInput],
      deadlineSec
    ),
    valueHex: "0x" + BigInt(ethAmountWei).toString(16),
  };
}

/**
 * Direct USDC -> NARA (isBuy=true) or NARA -> USDC (isBuy=false) Universal Router calldata (0x1004)
 * on NARALiquidityHookV5. Matches naraDexRouter.encodeV4HookSwapCalldata byte-for-byte.
 */
export function encodeV4HookSwapUniversalRouter(
  isBuy,
  amountInWei,
  minAmountOutWei,
  deadlineSec,
  recipient
) {
  const tokenIn = isBuy ? V4_SWAP_CONSTANTS.usdc : V4_SWAP_CONSTANTS.nara;
  const tokenOut = isBuy ? V4_SWAP_CONSTANTS.nara : V4_SWAP_CONSTANTS.usdc;

  const swapParams = encodeV4ExactInputSingleParamHex(isBuy, amountInWei, minAmountOutWei);
  const settleParams = abiWordAddr(tokenIn) + abiWordU256(amountInWei);
  const takeParams = abiWordAddr(tokenOut) + abiWordU256(minAmountOutWei);

  const v4Input = encodeV4ActionPlanHex("060c0f", [swapParams, settleParams, takeParams]);

  const hasRecipient = isValidAddress(recipient) && strip0x(recipient) !== "0".repeat(40);
  if (hasRecipient) {
    const sweepInput = abiWordAddr(tokenOut) + abiWordAddr(recipient) + abiWordU256(0n);
    return {
      to: V4_SWAP_CONSTANTS.universalRouter,
      data: encodeUniversalRouterExecute("1004", [v4Input, sweepInput], deadlineSec),
      valueHex: "0x0",
    };
  }
  return {
    to: V4_SWAP_CONSTANTS.universalRouter,
    data: encodeUniversalRouterExecute("10", [v4Input], deadlineSec),
    valueHex: "0x0",
  };
}

// --- Live On-Chain Quote Orchestrator (Never Invents Fake $100 Fallbacks) ---

export function clampSlippageBps(rawBps) {
  const n = Number(rawBps);
  if (!Number.isFinite(n)) return V4_SWAP_CONSTANTS.defaultSlippageBps;
  return Math.max(
    V4_SWAP_CONSTANTS.minSlippageBps,
    Math.min(V4_SWAP_CONSTANTS.maxSlippageBps, Math.round(n))
  );
}

/**
 * Quotes a live V4 Hook swap using any async `ethCall(to, data)` transport.
 * Throws if trading is paused or live Base RPC calls fail — never returns synthetic estimates.
 */
export async function quoteLiveV4Swap({ direction, asset, amountStr, slippageBps, ethCall }) {
  const dir = direction === "sell" ? "sell" : "buy";
  const payAsset = dir === "sell" ? "NARA" : asset === "USDC" ? "USDC" : "ETH";
  const decimalsIn = payAsset === "USDC" ? 6 : 18;
  const decimalsOut = dir === "sell" ? 6 : 18;
  const amountInWei = parseUnits(amountStr, decimalsIn);
  if (amountInWei <= 0n) {
    throw new Error("Enter an amount greater than zero.");
  }

  const effSlippageBps = clampSlippageBps(slippageBps);

  const [pausedHex, slot0Hex] = await Promise.all([
    ethCall(V4_SWAP_CONSTANTS.hook, encodeTradingPausedCall()),
    ethCall(V4_SWAP_CONSTANTS.poolManager, encodeSlot0ExtsloadCall()).catch(() => null),
  ]);

  const tradingPaused = decodeBoolResult(pausedHex);
  const spotUsdPerNara = slot0Hex ? decodeSlot0UsdPerNara(slot0Hex) : null;

  if (tradingPaused) {
    return {
      tradingOpen: false,
      spotUsdPerNara,
      direction: dir,
      asset: payAsset,
      amountIn: formatUnits(amountInWei, decimalsIn),
      amountInWei: amountInWei.toString(),
      expectedOut: "0",
      expectedOutWei: "0",
      minOut: "0",
      minOutWei: "0",
      hookFeeBps: 463,
      slippageBps: effSlippageBps,
    };
  }

  let v4InputWei = amountInWei;
  let minUsdcWei = 0n;
  let estEthUsd = null;

  if (dir === "buy" && payAsset === "ETH") {
    const v3Hex = await ethCall(
      V4_SWAP_CONSTANTS.v3QuoterV2,
      encodeV3WethToUsdcQuoterCall(amountInWei)
    );
    const estUsdcWei = decodeFirstUint256(v3Hex);
    if (estUsdcWei <= 0n) throw new Error("ETH bridge quote returned zero USDC.");
    minUsdcWei = (estUsdcWei * 9950n) / 10000n;
    if (minUsdcWei <= 0n) throw new Error("ETH amount is too small to swap.");
    v4InputWei = minUsdcWei;
    estEthUsd = Number(formatUnits(estUsdcWei, 6));
  }

  const zeroForOne = dir === "buy";
  const hookCurrency = zeroForOne ? V4_SWAP_CONSTANTS.usdc : V4_SWAP_CONSTANTS.nara;

  const [v4QuoteHex, grossHex] = await Promise.all([
    ethCall(V4_SWAP_CONSTANTS.v4Quoter, encodeV4QuoterSingleCall(zeroForOne, v4InputWei)),
    ethCall(V4_SWAP_CONSTANTS.hook, encodeHookQuoteGrossCall(hookCurrency, v4InputWei)).catch(
      () => null
    ),
  ]);

  const expectedOutWei = decodeFirstUint256(v4QuoteHex);
  if (expectedOutWei <= 0n) {
    throw new Error("Pool quote returned zero output.");
  }

  let hookFeeBps = 463;
  if (grossHex) {
    try {
      const { feeWei } = decodeHookQuoteGross(grossHex);
      const bps = Number((feeWei * 10000n) / v4InputWei);
      if (Number.isFinite(bps) && bps > 0) hookFeeBps = bps;
    } catch {
      hookFeeBps = 463;
    }
  }

  const rawMinOutWei = (expectedOutWei * BigInt(10000 - effSlippageBps)) / 10000n;
  const minOutWei = rawMinOutWei > 0n ? rawMinOutWei : 1n;

  return {
    tradingOpen: true,
    spotUsdPerNara,
    estInputUsd:
      dir === "buy"
        ? payAsset === "USDC"
          ? Number(formatUnits(amountInWei, 6))
          : estEthUsd
        : spotUsdPerNara
          ? Number(formatUnits(amountInWei, 18)) * spotUsdPerNara
          : null,
    direction: dir,
    asset: payAsset,
    amountIn: formatUnits(amountInWei, decimalsIn),
    amountInWei: amountInWei.toString(),
    expectedOut: formatUnits(expectedOutWei, decimalsOut),
    expectedOutDisplay:
      dir === "buy" ? formatDisplayNara(expectedOutWei) : formatDisplayUsdc(expectedOutWei),
    expectedOutWei: expectedOutWei.toString(),
    minOut: formatUnits(minOutWei, decimalsOut),
    minOutDisplay:
      dir === "buy" ? formatDisplayNara(minOutWei) : formatDisplayUsdc(minOutWei),
    minOutWei: minOutWei.toString(),
    intermediateUsdcWei: minUsdcWei > 0n ? minUsdcWei.toString() : undefined,
    hookFeeBps,
    isSurgeTier: hookFeeBps > 463,
    slippageBps: effSlippageBps,
    routeLabel:
      dir === "buy"
        ? payAsset === "ETH"
          ? `1-Click Atomic · ETH → USDC → NARA V5 Hook (${(hookFeeBps / 100).toFixed(2)}% hook fee)`
          : `Direct Uniswap v4 · NARA V5 Hook (${(hookFeeBps / 100).toFixed(2)}% hook fee)`
        : `Direct Uniswap v4 · NARA V5 Hook (${(hookFeeBps / 100).toFixed(2)}% hook fee)`,
  };
}
