// ERC-8021 Transaction Attribution (Schema 0 — Canonical Base Builder Code Registry)
// + ERC-5792 Smart Wallet (Base Account / Coinbase Smart Wallet) `wallet_sendCalls` + `dataSuffix` capability.
//
// Exact byte layout per wevm/ox `Attribution.toDataSuffix`:
//   codesHex ∥ codesLength (1 byte) ∥ schemaId (0x00, 1 byte) ∥ ercSuffix (16 bytes)
// Reference vector (`['baseapp', 'morpho']`):
//   0x626173656170702c6d6f7270686f0e0080218021802180218021802180218021

export const ERC8021_MARKER_HEX = "80218021802180218021802180218021";
const VALID_CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const MINIAPP_PARENT_HOST_RE =
  /^https:\/\/([a-z0-9-]+\.)*(?:warpcast\.com|farcaster\.xyz|base\.app|coinbase\.com)(?::443)?(?:\/|$)/i;

/**
 * Normalize one or more builder code inputs (array or comma-separated string).
 * Invalid or empty entries are ignored so misconfiguration never breaks user txs.
 * @param {string | readonly string[] | null | undefined} input
 * @returns {string[]}
 */
export function normalizeBuilderCodes(input) {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : String(input).split(",");
  const seen = new Set();
  const out = [];
  for (const item of rawList) {
    const code = String(item ?? "").trim();
    if (!code || !VALID_CODE_RE.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Encode ERC-8021 Schema 0 `dataSuffix` (`0x...`) for one or more Base Builder Codes.
 * Returns `""` when no valid builder code is configured.
 * @param {string | readonly string[] | null | undefined} codesInput
 * @returns {string}
 */
export function toErc8021DataSuffix(codesInput) {
  const codes = normalizeBuilderCodes(codesInput);
  if (codes.length === 0) return "";

  const joined = codes.join(",");
  if (joined.length > 255) return "";

  let codesHex = "";
  for (let i = 0; i < joined.length; i++) {
    codesHex += joined.charCodeAt(i).toString(16).padStart(2, "0");
  }
  const codesLenHex = joined.length.toString(16).padStart(2, "0");
  return `0x${codesHex}${codesLenHex}00${ERC8021_MARKER_HEX}`;
}

/**
 * Append ERC-8021 `dataSuffix` onto existing `0x`-prefixed contract calldata (`>= 4` selector bytes).
 * Leaves empty `0x` native ETH transfers untouched and is idempotent when already present.
 * @param {string} data
 * @param {string | readonly string[] | null | undefined} codesInput
 * @returns {string}
 */
export function appendErc8021DataSuffix(data, codesInput) {
  if (typeof data !== "string" || data.length < 10 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(data)) {
    return data;
  }
  if (data.toLowerCase().endsWith(ERC8021_MARKER_HEX)) {
    return data;
  }
  const suffix = toErc8021DataSuffix(codesInput);
  if (!suffix) return data;
  return `${data}${suffix.slice(2)}`;
}

function isUserRejectionError(err) {
  const code = err?.code ?? err?.data?.originalError?.code;
  const msg = String(err?.shortMessage || err?.message || "");
  return code === 4001 || /user rejected|user denied|cancelled|rejected the request/i.test(msg);
}

/**
 * Probes EIP-5792 `wallet_getCapabilities` for `dataSuffix` and `atomic` batch support on Base (8453).
 * Strict Attribution Invariant: `hasDataSuffixCap` is ONLY true when the wallet explicitly advertises
 * `dataSuffix.supported === true` (e.g. Base Account / Coinbase Smart Wallet), preventing silent
 * attribution loss on smart-account wallets that ignore optional `dataSuffix` capabilities.
 */
export async function probeErc5792Capabilities(provider, signerAccount, chainIdHex = "0x2105") {
  if (!provider || typeof provider.request !== "function" || !signerAccount) {
    return { hasDataSuffixCap: false, hasAtomicBatch: false };
  }
  let caps = null;
  try {
    caps = await provider.request({
      method: "wallet_getCapabilities",
      params: [signerAccount, [chainIdHex]],
    });
  } catch {
    try {
      caps = await provider.request({
        method: "wallet_getCapabilities",
        params: [signerAccount],
      });
    } catch {
      caps = null;
    }
  }
  if (!caps || typeof caps !== "object") {
    return { hasDataSuffixCap: false, hasAtomicBatch: false };
  }
  const decKey = String(parseInt(chainIdHex, 16));
  const chainCaps =
    caps[chainIdHex] ??
    caps[chainIdHex.toLowerCase()] ??
    caps[chainIdHex.toUpperCase()] ??
    caps[decKey] ??
    null;
  if (!chainCaps || typeof chainCaps !== "object") {
    return { hasDataSuffixCap: false, hasAtomicBatch: false };
  }
  const hasDataSuffixCap = Boolean(
    chainCaps?.dataSuffix?.supported === true || chainCaps?.dataSuffix?.status === "supported"
  );
  const hasAtomicBatch = Boolean(
    chainCaps?.atomic?.status === "supported" ||
      chainCaps?.atomic?.status === "ready" ||
      chainCaps?.atomicBatch?.supported === true
  );
  return { hasDataSuffixCap, hasAtomicBatch };
}

/**
 * Polls `wallet_getCallsStatus` across EIP-5792 v1.0 (`"CONFIRMED"`) and v2.0.0 (`status: 200..299`),
 * verifying every receipt succeeded on-chain and returning the final Base L2 `txHash`.
 */
export async function waitForWalletCallsReceipt(provider, batchId, timeoutMs = 90000, pollMs = 1200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let statusObj = null;
    try {
      statusObj = await provider.request({
        method: "wallet_getCallsStatus",
        params: [batchId],
      });
    } catch {
      statusObj = null;
    }
    if (statusObj && typeof statusObj === "object") {
      const st = statusObj.status;
      const isConfirmed =
        st === "CONFIRMED" ||
        st === "confirmed" ||
        (typeof st === "number" && st >= 200 && st < 300);
      const isFailed =
        st === "FAILED" ||
        st === "REVERTED" ||
        (typeof st === "number" && st >= 400);

      if (isFailed) {
        throw new Error("Smart wallet batch reverted or failed. Check BaseScan for details.");
      }

      if (isConfirmed) {
        const receipts = Array.isArray(statusObj.receipts) ? statusObj.receipts : [];
        if (receipts.length > 0) {
          for (const r of receipts) {
            if (r?.status !== undefined && r?.status !== null) {
              const ok = r.status === "0x1" || r.status === 1 || r.status === "1";
              if (!ok) {
                throw new Error("Transaction reverted on-chain. Check BaseScan for details.");
              }
            }
          }
          const lastHash = receipts[receipts.length - 1]?.transactionHash;
          if (typeof lastHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(lastHash)) {
            return { txHash: lastHash, receipts };
          }
        }
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Transaction submitted — still awaiting Base block confirmation. Check BaseScan.");
}

/**
 * Attempts an atomic EIP-5792 `wallet_sendCalls` execution with `capabilities.dataSuffix` when
 * supported by the connected Smart Wallet (Base Account / Coinbase Smart Wallet).
 * Returns `{ usedSendCalls: false }` when the wallet is a standard EOA or lacks `dataSuffix`
 * capability so the caller falls back cleanly to `eth_sendTransaction`.
 */
export async function trySendCallsWithErc8021({
  provider,
  chainIdHex = "0x2105",
  from,
  calls,
  codesInput,
  timeoutMs = 90000,
  pollMs = 1200,
  onSubmitted,
}) {
  const suffix = toErc8021DataSuffix(codesInput);
  if (!suffix || !Array.isArray(calls) || calls.length === 0) {
    return { usedSendCalls: false, txHash: null };
  }

  const { hasDataSuffixCap, hasAtomicBatch } = await probeErc5792Capabilities(
    provider,
    from,
    chainIdHex
  );
  if (!hasDataSuffixCap || (calls.length > 1 && !hasAtomicBatch)) {
    return { usedSendCalls: false, txHash: null };
  }

  const formattedCalls = calls.map((c) => ({
    to: c.to,
    value: c.value || "0x0",
    data: appendErc8021DataSuffix(c.data || "0x", codesInput),
  }));
  const capabilities = {
    dataSuffix: {
      value: suffix,
      optional: true,
    },
  };

  let rawResult = null;
  try {
    rawResult = await provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          chainId: chainIdHex,
          from,
          atomicRequired: calls.length > 1,
          calls: formattedCalls,
          capabilities,
        },
      ],
    });
  } catch (errV2) {
    if (isUserRejectionError(errV2)) throw errV2;
    try {
      rawResult = await provider.request({
        method: "wallet_sendCalls",
        params: [
          {
            version: "1.0",
            chainId: chainIdHex,
            from,
            calls: formattedCalls,
            capabilities,
          },
        ],
      });
    } catch (errV1) {
      if (isUserRejectionError(errV1)) throw errV1;
      return { usedSendCalls: false, txHash: null };
    }
  }

  const batchId = typeof rawResult === "string" ? rawResult : rawResult?.id;
  if (typeof batchId !== "string" || !batchId.trim()) {
    return { usedSendCalls: false, txHash: null };
  }

  if (typeof onSubmitted === "function") {
    onSubmitted(batchId);
  }
  const { txHash } = await waitForWalletCallsReceipt(provider, batchId, timeoutMs, pollMs);
  return { usedSendCalls: true, txHash, batchId };
}

/**
 * Dismisses the Farcaster / Base App Mini App splash overlay when embedded in a trusted host.
 */
export function notifyMiniAppHostReady(
  win = typeof window !== "undefined" ? window : undefined,
  doc = typeof document !== "undefined" ? document : undefined
) {
  if (!win) return;
  try {
    let inFrame = false;
    try {
      inFrame = Boolean(win.self && win.top && win.self !== win.top);
    } catch {
      inFrame = true;
    }
    if (!inFrame) return;

    const ancestors = win.location?.ancestorOrigins;
    let trusted = false;
    if (ancestors && typeof ancestors.length === "number" && ancestors.length > 0) {
      for (let i = 0; i < ancestors.length; i++) {
        if (MINIAPP_PARENT_HOST_RE.test(String(ancestors[i] || ""))) {
          trusted = true;
          break;
        }
      }
    } else {
      const ref = typeof doc?.referrer === "string" ? doc.referrer : "";
      trusted = MINIAPP_PARENT_HOST_RE.test(ref);
    }
    if (!trusted || !win.parent || win.parent === win) return;

    for (const origin of [
      "https://farcaster.xyz",
      "https://warpcast.com",
      "https://client.warpcast.com",
      "https://base.app",
      "https://wallet.coinbase.com",
    ]) {
      win.parent.postMessage({ type: "frame:ready" }, origin);
      win.parent.postMessage({ type: "sdk.actions.ready" }, origin);
    }
  } catch {
    // Ignore cross-origin postMessage restrictions
  }
}
