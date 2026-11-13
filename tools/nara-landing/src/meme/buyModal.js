// Direct 1-Click Buy / Sell $NARA Web3 Engine & Hero Live Market Controller for naraprotocol.io.
//
// STRICT ARCHITECTURAL INVARIANT:
// 100% of NARA buys and sells route exclusively through NARALiquidityHookV5
// (0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC) on Uniswap v4 PoolManager via canonical
// Universal Router (0x6fF5693b99212Da76ad316178A184AB56D299b43). Zero V3 NARA pools,
// zero external aggregators, zero cross-wallet transfers (recipient === connectedAccount).

import { BASE_CHAIN_ID_HEX, CRYPTOSLIP_URL, CRYPTOSLIP_COMMIT_URL, NARA_CONTRACT } from "./config.js";
import {
  V4_SWAP_CONSTANTS,
  isValidAddress,
  parseUnits,
  formatUnits,
  formatDisplayNara,
  formatDisplayUsdc,
  encodeTradingPausedCall,
  decodeBoolResult,
  encodeSlot0ExtsloadCall,
  decodeSlot0UsdPerNara,
  encodeErc20BalanceOf,
  encodeErc20Allowance,
  encodeErc20Approve,
  encodePermit2Allowance,
  decodePermit2Allowance,
  encodePermit2Approve,
  decodeFirstUint256,
  encodeEthToNaraUniversalRouter,
  encodeV4HookSwapUniversalRouter,
  quoteLiveV4Swap,
} from "./v4SwapEngine.js";

const PUBLIC_BASE_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
];

const ETH_GAS_RESERVE_WEI = 300_000_000_000_000n; // 0.0003 ETH reserved on MAX so Base L2 gas always clears
const MIN_GAS_CHECK_WEI = 40_000_000_000_000n; // 0.00004 ETH minimum L2 gas buffer check

const PRESETS = {
  ETH: ["0.005", "0.01", "0.05", "0.1"],
  USDC: ["25", "100", "250", "500"],
  NARA: ["0.01", "0.05", "0.25", "1"],
};

// --- State ---
let modalDirection = "buy"; // "buy" | "sell"
let modalAsset = "ETH"; // "ETH" | "USDC" (when buy), "NARA" (when sell)
let modalAmount = "0.01";
let modalSlippageBps = V4_SWAP_CONSTANTS.defaultSlippageBps; // 500 = 5%
let modalQuote = null;
let modalQuoteSeq = 0;
let modalDebounceTimer = null;
let isQuotingModal = false;
let isExecutingSwap = false;
let currentModalStatusKind = "idle";

// EIP-6963 + window.ethereum wallet registry
const discoveredWallets = [];
let activeWalletEntry = null; // { id, name, provider }
let connectedAccount = null;
let connectedChainId = null;
let balances = { ethWei: 0n, usdcWei: 0n, naraWei: 0n, loaded: false };
let cleanupProviderListeners = null;

let soundClickFn = () => {};
let soundSuccessFn = () => {};
let copyCaFn = () => {};
let modalVisibilityChangeFn = () => {};

// --- Read-Only Base RPC Fallback ---

async function publicBaseRpcRequest(method, params) {
  let lastErr = null;
  for (const rpcUrl of PUBLIC_BASE_RPCS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (payload?.error) {
        const msg = String(payload.error.message || "Contract reverted");
        if (payload.error.code === 3 || /execution reverted|revert/i.test(msg)) {
          const rev = new Error(msg);
          rev.isRevert = true;
          throw rev;
        }
        throw new Error(msg);
      }
      return payload?.result;
    } catch (err) {
      clearTimeout(timer);
      if (err && err.isRevert) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Base RPC unavailable");
}

async function publicBaseEthCall(to, data) {
  try {
    const result = await publicBaseRpcRequest("eth_call", [{ to, data }, "latest"]);
    if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
      return result;
    }
    throw new Error("Empty RPC response");
  } catch (err) {
    if (err && err.isRevert) {
      const rev = new Error("Amount exceeds available pool liquidity or minimum swap size.");
      rev.isRevert = true;
      throw rev;
    }
    throw err;
  }
}

async function smartEthCall(to, data) {
  if (activeWalletEntry?.provider && connectedChainId === V4_SWAP_CONSTANTS.chainId) {
    try {
      const res = await activeWalletEntry.provider.request({
        method: "eth_call",
        params: [{ to, data }, "latest"],
      });
      if (typeof res === "string" && res.startsWith("0x") && res.length >= 66) {
        return res;
      }
    } catch (err) {
      const msg = String(err?.message || "");
      if (err?.code === 3 || /execution reverted|revert/i.test(msg)) {
        const rev = new Error("Amount exceeds available pool liquidity or minimum swap size.");
        rev.isRevert = true;
        throw rev;
      }
    }
  }
  return publicBaseEthCall(to, data);
}

async function fetchSwapQuote({ direction, asset, amountStr, slippageBps, bypassEdgeCache = false }) {
  if (!bypassEdgeCache) {
    try {
      const qs = new URLSearchParams({
        direction,
        asset,
        amount: amountStr,
        slippageBps: String(slippageBps),
      });
      const res = await fetch(`/api/quote?${qs.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 400 || res.status === 422) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Enter a valid swap amount within pool liquidity.");
      }
    } catch (err) {
      if (err instanceof Error && /valid swap amount|Amount must be|exceeds available pool/i.test(err.message)) {
        throw err;
      }
      // Fall through to direct Base RPC / connected wallet eth_call
    }
  }

  return quoteLiveV4Swap({
    direction,
    asset,
    amountStr,
    slippageBps,
    ethCall: smartEthCall,
  });
}

// --- Formatting Helpers ---

function shortAddr(addr) {
  if (!addr || addr.length < 10) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsdPrice(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (usd >= 1000) {
    return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (usd >= 1) {
    return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatEthDisplay(wei) {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 0.0001) return n.toLocaleString("en-US", { maximumFractionDigits: 5 });
  return "<0.0001";
}

function sanitizeAmountInput(raw) {
  const cleaned = String(raw || "")
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned.slice(0, 18);
  return `${parts[0].slice(0, 10)}.${parts.slice(1).join("").slice(0, 18)}`;
}

function formatWalletError(err) {
  const code = err?.code ?? err?.data?.originalError?.code;
  const msg = String(err?.shortMessage || err?.message || "Transaction failed");
  if (/^Safety simulation blocked/i.test(msg)) {
    return msg;
  }
  if (code === 4001 || /user rejected|user denied|rejected the request|cancelled/i.test(msg)) {
    return "Signature cancelled in wallet.";
  }
  if (/V4TooLittleReceived|TooLittleReceived|slippage/i.test(msg)) {
    return "Pool price moved beyond your slippage setting. Click Refresh Quote and try again.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Insufficient Base ETH in wallet to cover swap value + L2 network gas.";
  }
  return msg.length > 140 ? `${msg.slice(0, 137)}...` : msg;
}

// --- EIP-6963 & Injected Wallet Discovery ---

function registerWalletCandidate(id, name, provider) {
  if (!provider || typeof provider.request !== "function") return;
  const exists = discoveredWallets.some((w) => w.provider === provider || (id && w.id === id));
  if (exists) return;
  const safeName = String(name || "Browser Wallet").replace(/[^\w\s.+-]/g, "").trim().slice(0, 28) || "Browser Wallet";
  discoveredWallets.push({ id: id || `wallet-${discoveredWallets.length + 1}`, name: safeName, provider });
}

function discoverInjectedWallets() {
  if (typeof window === "undefined") return;

  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = event?.detail;
    if (detail?.provider) {
      const id = detail.info?.rdns || detail.info?.uuid || detail.info?.name;
      const name = detail.info?.name || "Web3 Wallet";
      registerWalletCandidate(id, name, detail.provider);
      renderModalWalletSection();
    }
  });

  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // Ignore older browsers
  }

  if (window.ethereum) {
    if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
      window.ethereum.providers.forEach((p, idx) => {
        const label = p?.isRabby
          ? "Rabby Wallet"
          : p?.isCoinbaseWallet
            ? "Coinbase Wallet"
            : p?.isMetaMask
              ? "MetaMask"
              : `Wallet #${idx + 1}`;
        registerWalletCandidate(`legacy-${idx}`, label, p);
      });
    } else {
      const p = window.ethereum;
      const label = p.isRabby
        ? "Rabby Wallet"
        : p.isCoinbaseWallet
          ? "Coinbase Wallet"
          : p.isPhantom
            ? "Phantom"
            : p.isMetaMask
              ? "MetaMask"
              : "Browser Wallet";
      registerWalletCandidate("window-ethereum", label, p);
    }
  }
}

async function ensureBaseChain(provider) {
  const currentHex = await provider.request({ method: "eth_chainId" });
  if (parseInt(String(currentHex), 16) === V4_SWAP_CONSTANTS.chainId) {
    connectedChainId = V4_SWAP_CONSTANTS.chainId;
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (switchErr) {
    const errCode = switchErr?.code ?? switchErr?.data?.originalError?.code;
    if (errCode === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_CHAIN_ID_HEX,
            chainName: "Base",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
    } else {
      throw switchErr;
    }
  }

  const afterHex = await provider.request({ method: "eth_chainId" });
  const parsed = parseInt(String(afterHex), 16);
  connectedChainId = parsed;
  if (parsed !== V4_SWAP_CONSTANTS.chainId) {
    throw new Error("Switch your wallet network to Base Mainnet (Chain ID 8453) to continue.");
  }
}

async function refreshConnectedBalances() {
  if (!connectedAccount) {
    balances = { ethWei: 0n, usdcWei: 0n, naraWei: 0n, loaded: false };
    renderModalWalletSection();
    return;
  }

  try {
    const provider = activeWalletEntry?.provider;
    const ethPromise =
      provider && connectedChainId === V4_SWAP_CONSTANTS.chainId
        ? provider
            .request({ method: "eth_getBalance", params: [connectedAccount, "latest"] })
            .catch(() => publicBaseRpcRequest("eth_getBalance", [connectedAccount, "latest"]))
        : publicBaseRpcRequest("eth_getBalance", [connectedAccount, "latest"]);

    const [ethHex, usdcHex, naraHex] = await Promise.all([
      ethPromise,
      smartEthCall(V4_SWAP_CONSTANTS.usdc, encodeErc20BalanceOf(connectedAccount)),
      smartEthCall(V4_SWAP_CONSTANTS.nara, encodeErc20BalanceOf(connectedAccount)),
    ]);

    balances = {
      ethWei: typeof ethHex === "string" && ethHex.startsWith("0x") ? BigInt(ethHex) : 0n,
      usdcWei: decodeFirstUint256(usdcHex),
      naraWei: decodeFirstUint256(naraHex),
      loaded: true,
    };
  } catch {
    // Keep prior balance snapshot if RPC hiccuped
  }
  renderModalWalletSection();
}

export function getConnectedWalletProvider() {
  return activeWalletEntry?.provider || null;
}

export function getConnectedAccount() {
  return connectedAccount || "";
}

function attachProviderEvents(walletEntry) {
  if (cleanupProviderListeners) {
    cleanupProviderListeners();
    cleanupProviderListeners = null;
  }
  const provider = walletEntry?.provider;
  if (!provider || typeof provider.on !== "function") return;

  const onAccounts = (accs) => {
    if (!Array.isArray(accs) || accs.length === 0 || !isValidAddress(accs[0])) {
      disconnectBuyWallet();
      return;
    }
    connectedAccount = accs[0].trim();
    refreshConnectedBalances();
    renderModalWalletSection();
  };

  const onChain = (chainHex) => {
    connectedChainId = parseInt(String(chainHex), 16) || null;
    refreshConnectedBalances();
    triggerModalQuote(true);
  };

  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);

  cleanupProviderListeners = () => {
    try {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    } catch {
      // Ignore cleanup errors on non-standard providers
    }
  };
}

async function connectSpecificWallet(walletEntry) {
  if (!walletEntry?.provider) return;
  setModalStatus("info", `Connecting ${walletEntry.name}...`);
  try {
    const accs = await walletEntry.provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accs) || !accs[0] || !isValidAddress(accs[0])) {
      throw new Error("No valid Base wallet address returned.");
    }
    activeWalletEntry = walletEntry;
    connectedAccount = accs[0].trim();
    const chainHex = await walletEntry.provider.request({ method: "eth_chainId" }).catch(() => null);
    connectedChainId = chainHex ? parseInt(String(chainHex), 16) : null;
    attachProviderEvents(walletEntry);

    const picker = document.getElementById("buyWalletPicker");
    if (picker) picker.classList.add("hidden");

    if (connectedChainId !== V4_SWAP_CONSTANTS.chainId) {
      await ensureBaseChain(walletEntry.provider);
    }

    setModalStatus("idle", "");
    await refreshConnectedBalances();
    triggerModalQuote(true);
  } catch (err) {
    setModalStatus("error", formatWalletError(err));
    renderModalWalletSection();
  }
}

export async function connectBuyWallet() {
  soundClickFn();
  if (discoveredWallets.length === 0) {
    discoverInjectedWallets();
  }
  const walletBox = document.getElementById("buyWalletBox");
  if (discoveredWallets.length === 0) {
    const noWalletBox = document.getElementById("buyNoWalletLinks");
    if (walletBox) walletBox.classList.remove("hidden");
    if (noWalletBox) noWalletBox.classList.remove("hidden");
    setModalStatus("info", "No browser wallet detected — open in MetaMask, Coinbase Wallet, or CryptoSLIP above.");
    return;
  }
  if (discoveredWallets.length === 1) {
    await connectSpecificWallet(discoveredWallets[0]);
    return;
  }
  // Multiple wallets installed (e.g. Rabby + MetaMask) -> let user pick cleanly
  const picker = document.getElementById("buyWalletPicker");
  const list = document.getElementById("buyWalletPickerList");
  if (picker && list) {
    list.innerHTML = "";
    discoveredWallets.forEach((w) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "w-full min-h-[40px] px-3 py-1.5 bg-white/[0.04] hover:bg-emerald-500/15 border border-white/15 hover:border-emerald-400/50 text-left text-[11px] font-mono font-bold text-white hover:text-naraGreen flex items-center justify-between transition-all cursor-pointer";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = w.name;
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "text-[10px] text-naraGreen";
      arrowSpan.textContent = "CONNECT →";
      btn.appendChild(nameSpan);
      btn.appendChild(arrowSpan);
      btn.addEventListener("click", () => connectSpecificWallet(w));
      list.appendChild(btn);
    });
    if (walletBox) walletBox.classList.remove("hidden");
    picker.classList.remove("hidden");
  } else {
    await connectSpecificWallet(discoveredWallets[0]);
  }
}

export function disconnectBuyWallet() {
  soundClickFn();
  if (cleanupProviderListeners) {
    cleanupProviderListeners();
    cleanupProviderListeners = null;
  }
  activeWalletEntry = null;
  connectedAccount = null;
  connectedChainId = null;
  balances = { ethWei: 0n, usdcWei: 0n, naraWei: 0n, loaded: false };
  renderModalWalletSection();
  updateModalSubmitButton();
}

// --- Live Spot & Supply Telemetry ---

export async function refreshHeroMarketTelemetry() {
  const spotEl = document.getElementById("heroSpotPrice");
  const modalSpotEl = document.getElementById("buyModalSpotBadge");
  const modalCircEl = document.getElementById("buyModalCircBadge");

  // 1. Live Spot Price
  (async () => {
    let spotUsd = null;
    try {
      const res = await fetch("/api/quote?summary=1", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        spotUsd = data.spotUsdPerNara;
      }
    } catch {
      // Fall back to direct Base RPC below
    }
    if (!spotUsd) {
      try {
        const slot0Hex = await publicBaseEthCall(V4_SWAP_CONSTANTS.poolManager, encodeSlot0ExtsloadCall());
        spotUsd = decodeSlot0UsdPerNara(slot0Hex);
      } catch {
        spotUsd = null;
      }
    }
    const formatted = formatUsdPrice(spotUsd);
    if (formatted) {
      if (spotEl) spotEl.textContent = `1 NARA ≈ ${formatted}`;
      if (modalSpotEl) modalSpotEl.textContent = `1 NARA ≈ ${formatted}`;
    }
  })();

  // 2. Live Circulating Supply
  (async () => {
    try {
      const res = await fetch("/api/supply", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      const circNum = Number(data?.circulatingSupply);
      if (Number.isFinite(circNum) && circNum > 0 && modalCircEl) {
        modalCircEl.textContent = `${circNum.toLocaleString("en-US", { maximumFractionDigits: 2 })} / 1M CIRC`;
      }
    } catch {
      // Keep clean default in static preview
    }
  })();
}

export function copyBuyModalCA() {
  copyCaFn();
  const label = document.getElementById("buyModalCopyCaLabel");
  if (label) {
    label.textContent = "✓ CA COPIED";
    label.classList.add("text-naraGreen");
    setTimeout(() => {
      label.textContent = "📋 COPY CA";
      label.classList.remove("text-naraGreen");
    }, 2200);
  }
}

// --- Full Buy / Sell $NARA Modal ---

export function isBuyModalOpen() {
  const modal = document.getElementById("buyNaraModal");
  return !!(modal && !modal.classList.contains("hidden"));
}

export function openBuyModal() {
  soundClickFn();
  const modal = document.getElementById("buyNaraModal");
  if (!modal) return;
  discoverInjectedWallets();
  modal.classList.remove("hidden");
  modalVisibilityChangeFn();
  renderModalControls();
  renderModalWalletSection();
  triggerModalQuote(true);
}

export function closeBuyModal(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  if (isExecutingSwap) return; // Never dismiss mid-transaction while awaiting receipt
  soundClickFn();
  const modal = document.getElementById("buyNaraModal");
  if (modal) modal.classList.add("hidden");
  modalVisibilityChangeFn();
}

function setModalStatus(kind, message) {
  const box = document.getElementById("buyModalStatusBox");
  if (!box) return;
  if (!message || kind === "idle") {
    currentModalStatusKind = "idle";
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  currentModalStatusKind = kind;
  box.classList.remove("hidden");
  const styles = {
    info: "p-2.5 bg-sky-500/10 border border-sky-400/40 text-sky-200 text-[10px] font-mono leading-relaxed",
    warn: "p-2.5 bg-amber-500/10 border border-amber-400/40 text-amber-200 text-[10px] font-mono leading-relaxed",
    error: "p-2.5 bg-red-500/15 border border-red-500/50 text-red-200 text-[10px] font-mono leading-relaxed",
    success: "p-2.5 bg-emerald-500/15 border border-naraGreen/60 text-naraGreen text-[10px] font-mono leading-relaxed",
  };
  box.className = styles[kind] || styles.info;
  box.textContent = message;
}

function hideTxReceiptBox() {
  const box = document.getElementById("buyModalReceiptBox");
  if (box) box.classList.add("hidden");
}

function showTxReceiptBox(txHash, summaryLine) {
  const box = document.getElementById("buyModalReceiptBox");
  const textEl = document.getElementById("buyModalReceiptSummary");
  const linkEl = document.getElementById("buyModalReceiptLink");
  if (!box) return;
  if (textEl) textEl.textContent = summaryLine;
  if (linkEl) linkEl.href = `https://basescan.org/tx/${txHash}`;
  box.classList.remove("hidden");
}

function renderModalWalletSection() {
  const walletBox = document.getElementById("buyWalletBox");
  const connectedRow = document.getElementById("buyWalletConnectedRow");
  const picker = document.getElementById("buyWalletPicker");
  const addrBadge = document.getElementById("buyWalletAddrText");
  const balText = document.getElementById("buyWalletBalText");
  const noWalletBox = document.getElementById("buyNoWalletLinks");
  const mmDeepLink = document.getElementById("buyOpenMetaMaskMobile");
  const cbDeepLink = document.getElementById("buyOpenCoinbaseMobile");
  const csDeepLink = document.getElementById("buyOpenCryptoSlipApp");

  if (mmDeepLink) mmDeepLink.href = "https://metamask.app.link/dapp/naraprotocol.io/?buy=1";
  if (cbDeepLink) cbDeepLink.href = "https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Fnaraprotocol.io%2F%3Fbuy%3D1";
  if (csDeepLink) csDeepLink.href = CRYPTOSLIP_URL;

  if (connectedAccount) {
    if (walletBox) walletBox.classList.remove("hidden");
    if (connectedRow) connectedRow.classList.remove("hidden");
    if (picker) picker.classList.add("hidden");
    if (noWalletBox) noWalletBox.classList.add("hidden");
    if (addrBadge) {
      const chainLabel = connectedChainId === V4_SWAP_CONSTANTS.chainId ? "BASE" : "SWITCH CHAIN";
      addrBadge.textContent = `${activeWalletEntry?.name || "Wallet"} · ${shortAddr(connectedAccount)} [${chainLabel}]`;
    }
    if (balText) {
      if (!balances.loaded) {
        balText.textContent = "Reading Base balances…";
      } else {
        balText.textContent = `${formatEthDisplay(balances.ethWei)} ETH · $${formatDisplayUsdc(balances.usdcWei)} USDC · ${formatDisplayNara(balances.naraWei)} NARA`;
      }
    }
  } else {
    if (connectedRow) connectedRow.classList.add("hidden");
    if (picker) picker.classList.add("hidden");
    if (noWalletBox) noWalletBox.classList.add("hidden");
    if (walletBox) walletBox.classList.add("hidden");
  }

  updateModalSubmitButton();
}

function renderModalControls() {
  const heading = document.getElementById("buyModalHeading");
  const tabBuy = document.getElementById("buyTabBuyBtn");
  const tabSell = document.getElementById("buyTabSellBtn");
  const assetRow = document.getElementById("buyAssetSelectorRow");
  const ethBtn = document.getElementById("buyModalAssetEthBtn");
  const usdcBtn = document.getElementById("buyModalAssetUsdcBtn");
  const amountInput = document.getElementById("buyModalAmountInput");
  const inUnit = document.getElementById("buyModalPayUnit");
  const outUnit = document.getElementById("buyModalOutUnit");
  const commitLink = document.getElementById("buyModalCommitLink");

  if (heading) heading.textContent = modalDirection === "sell" ? "SELL $NARA" : "BUY $NARA";
  if (commitLink) commitLink.href = CRYPTOSLIP_COMMIT_URL;

  const tabActive =
    "flex-1 min-h-[38px] py-1.5 bg-naraGreen text-black font-mono font-extrabold text-[11px] uppercase tracking-wider cursor-pointer transition-all";
  const tabInactive =
    "flex-1 min-h-[38px] py-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-white/65 hover:text-white font-mono font-bold text-[11px] uppercase tracking-wider cursor-pointer transition-all";

  if (tabBuy) tabBuy.className = modalDirection === "buy" ? tabActive : tabInactive;
  if (tabSell) tabSell.className = modalDirection === "sell" ? tabActive : tabInactive;

  if (assetRow) assetRow.classList.toggle("hidden", modalDirection === "sell");

  const pillActive =
    "min-h-[28px] px-2.5 py-0.5 bg-emerald-500/20 border border-naraGreen text-naraGreen text-[10px] font-mono font-bold uppercase cursor-pointer transition-all";
  const pillInactive =
    "min-h-[28px] px-2.5 py-0.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-white/65 hover:text-white text-[10px] font-mono font-bold uppercase cursor-pointer transition-all";

  if (ethBtn) ethBtn.className = modalAsset === "ETH" ? pillActive : pillInactive;
  if (usdcBtn) usdcBtn.className = modalAsset === "USDC" ? pillActive : pillInactive;

  const activePayAsset = modalDirection === "sell" ? "NARA" : modalAsset;
  if (inUnit) inUnit.textContent = activePayAsset;
  if (outUnit) outUnit.textContent = modalDirection === "sell" ? "USDC" : "$NARA";
  if (amountInput && document.activeElement !== amountInput) {
    amountInput.value = modalAmount;
  }

  // Toggle preset chips for active asset
  const presetsWrap = document.getElementById("buyModalPresetsWrap");
  if (presetsWrap) {
    presetsWrap.querySelectorAll("[data-modal-preset-asset]").forEach((btn) => {
      btn.classList.toggle("hidden", btn.getAttribute("data-modal-preset-asset") !== activePayAsset);
    });
  }

  // Slippage buttons
  [200, 500, 1000, 2000].forEach((bps) => {
    const el = document.getElementById(`buySlipBtn-${bps}`);
    if (!el) return;
    el.className =
      modalSlippageBps === bps
        ? "px-2 py-0.5 min-h-[28px] bg-emerald-500/20 border border-naraGreen text-naraGreen text-[10px] font-mono font-bold cursor-pointer"
        : "px-2 py-0.5 min-h-[28px] bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-white/60 hover:text-white text-[10px] font-mono cursor-pointer";
  });

  updateModalSubmitButton();
}

function updateModalSubmitButton() {
  const btn = document.getElementById("buyModalSubmitBtn");
  const label = document.getElementById("buyModalSubmitLabel");
  if (!btn || !label) return;

  if (isExecutingSwap) {
    btn.disabled = true;
    btn.className =
      "w-full min-h-[48px] py-3 bg-emerald-500/30 border border-emerald-400/50 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-wait opacity-80";
    return;
  }

  if (!connectedAccount) {
    btn.disabled = false;
    btn.className =
      "w-full min-h-[48px] py-3 bg-naraGreen hover:bg-[#52ff33] active:bg-emerald-400 text-black font-mono font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-[0_0_24px_rgba(57,255,20,0.35)] transition-all";
    label.textContent = "⚡ CONNECT WALLET";
    return;
  }

  if (connectedChainId !== V4_SWAP_CONSTANTS.chainId) {
    btn.disabled = false;
    btn.className =
      "w-full min-h-[48px] py-3 bg-amber-400 hover:bg-amber-300 text-black font-mono font-extrabold text-xs uppercase tracking-wider cursor-pointer transition-all";
    label.textContent = "SWITCH TO BASE [8453]";
    return;
  }

  if (isQuotingModal) {
    btn.disabled = true;
    btn.className =
      "w-full min-h-[48px] py-3 bg-white/10 border border-white/15 text-white/60 font-mono font-bold text-xs uppercase tracking-wider cursor-wait";
    label.textContent = "QUOTING…";
    return;
  }

  if (!modalQuote || !modalQuote.tradingOpen || BigInt(modalQuote.minOutWei || "0") <= 0n) {
    btn.disabled = true;
    btn.className =
      "w-full min-h-[48px] py-3 bg-white/[0.06] border border-white/15 text-white/45 font-mono font-bold text-xs uppercase tracking-wider cursor-not-allowed";
    label.textContent = modalQuote && !modalQuote.tradingOpen ? "POOL PAUSED" : "ENTER AMOUNT";
    return;
  }

  btn.disabled = false;
  btn.className =
    "w-full min-h-[48px] py-3 bg-naraGreen hover:bg-[#52ff33] active:bg-emerald-400 text-black font-mono font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-[0_0_24px_rgba(57,255,20,0.35)] transition-all";
  if (modalDirection === "sell") {
    label.textContent = `SELL ${modalQuote.amountIn} $NARA → ~$${modalQuote.expectedOutDisplay}`;
  } else {
    label.textContent = `⚡ BUY ~${modalQuote.expectedOutDisplay} $NARA`;
  }
}

async function runModalQuote() {
  const seq = ++modalQuoteSeq;
  const outEl = document.getElementById("buyModalOutValue");
  const minEl = document.getElementById("buyModalMinOut");
  const feeEl = document.getElementById("buyModalHookFee");
  const routeEl = document.getElementById("buyModalRouteText");

  const surgeHint = document.getElementById("buyModalSurgeHint");
  const surgeText = document.getElementById("buyModalSurgeText");

  const activePayAsset = modalDirection === "sell" ? "NARA" : modalAsset;
  const trimmed = String(modalAmount || "").trim();

  if (!trimmed || Number(trimmed) <= 0) {
    modalQuote = null;
    isQuotingModal = false;
    if (outEl) outEl.textContent = "0";
    if (minEl) minEl.textContent = "—";
    if (feeEl) feeEl.textContent = "4.63% V5 Hook + 0.30% LP";
    if (routeEl) routeEl.textContent = "Uniswap v4 NARA V5 Hook (Base 8453)";
    if (surgeHint) surgeHint.classList.add("hidden");
    updateModalSubmitButton();
    return;
  }

  isQuotingModal = true;
  updateModalSubmitButton();
  if (outEl) outEl.textContent = "…";

  try {
    const q = await fetchSwapQuote({
      direction: modalDirection,
      asset: activePayAsset,
      amountStr: trimmed,
      slippageBps: modalSlippageBps,
    });
    if (seq !== modalQuoteSeq) return;
    isQuotingModal = false;
    modalQuote = q;

    if (!q.tradingOpen) {
      if (outEl) outEl.textContent = "PAUSED";
      if (minEl) minEl.textContent = "—";
      if (surgeHint) surgeHint.classList.add("hidden");
      setModalStatus("warn", "Trading on NARALiquidityHookV5 is currently paused.");
      updateModalSubmitButton();
      return;
    }

    if (outEl) {
      outEl.textContent = modalDirection === "sell" ? `$${q.expectedOutDisplay}` : q.expectedOutDisplay;
    }
    if (minEl) {
      minEl.textContent =
        modalDirection === "sell"
          ? `$${q.minOutDisplay} USDC (${(q.slippageBps / 100).toFixed(0)}% max slip)`
          : `${q.minOutDisplay} NARA (${(q.slippageBps / 100).toFixed(0)}% max slip)`;
    }
    if (feeEl) {
      feeEl.textContent = `${(q.hookFeeBps / 100).toFixed(2)}% V5 Hook${q.isSurgeTier ? " (anti-bot surge active)" : ""} + 0.30% LP`;
    }
    if (surgeHint) {
      if (q.isSurgeTier) {
        if (surgeText) surgeText.textContent = `Surge hook fee: ${(q.hookFeeBps / 100).toFixed(2)}% on this size`;
        surgeHint.classList.remove("hidden");
      } else {
        surgeHint.classList.add("hidden");
      }
    }
    if (routeEl) {
      routeEl.textContent = q.routeLabel;
    }
    const spotBadge = document.getElementById("buyModalSpotBadge");
    const heroSpot = document.getElementById("heroSpotPrice");
    const formattedSpot = formatUsdPrice(q.spotUsdPerNara);
    if (formattedSpot) {
      if (spotBadge) spotBadge.textContent = `1 NARA ≈ ${formattedSpot}`;
      if (heroSpot) heroSpot.textContent = `1 NARA ≈ ${formattedSpot}`;
    }
    if (currentModalStatusKind === "warn") setModalStatus("idle", "");
  } catch (err) {
    if (seq !== modalQuoteSeq) return;
    isQuotingModal = false;
    modalQuote = null;
    if (outEl) outEl.textContent = "—";
    if (minEl) minEl.textContent = "—";
    if (surgeHint) surgeHint.classList.add("hidden");
    setModalStatus("warn", err?.message || "Live Base quote unavailable — click Refresh Quote to retry.");
  }
  updateModalSubmitButton();
}

function triggerModalQuote(immediate = false) {
  clearTimeout(modalDebounceTimer);
  if (immediate) {
    runModalQuote();
  } else {
    modalDebounceTimer = setTimeout(runModalQuote, 240);
  }
}

export function setBuyModalDirection(_e, dir) {
  if (isExecutingSwap) return;
  soundClickFn();
  const next = dir === "sell" ? "sell" : "buy";
  if (modalDirection === next) return;
  modalDirection = next;
  if (next === "sell") {
    modalAmount = "0.05";
  } else {
    modalAmount = modalAsset === "USDC" ? "100" : "0.01";
  }
  const input = document.getElementById("buyModalAmountInput");
  if (input) input.value = modalAmount;
  hideTxReceiptBox();
  renderModalControls();
  triggerModalQuote(true);
}

export function setBuyModalAsset(_e, asset) {
  if (isExecutingSwap) return;
  soundClickFn();
  const next = asset === "USDC" ? "USDC" : "ETH";
  if (modalAsset === next && modalDirection === "buy") return;
  modalDirection = "buy";
  modalAsset = next;
  modalAmount = next === "USDC" ? "100" : "0.01";
  const input = document.getElementById("buyModalAmountInput");
  if (input) input.value = modalAmount;
  hideTxReceiptBox();
  renderModalControls();
  triggerModalQuote(true);
}

export function setBuyModalPreset(_e, val) {
  if (isExecutingSwap) return;
  soundClickFn();
  modalAmount = String(val || "0.01");
  const input = document.getElementById("buyModalAmountInput");
  if (input) input.value = modalAmount;
  hideTxReceiptBox();
  triggerModalQuote(true);
}

export function applyLowFeeSwapSize() {
  if (isExecutingSwap) return;
  soundClickFn();
  const activePayAsset = modalDirection === "sell" ? "NARA" : modalAsset;
  modalAmount = activePayAsset === "USDC" ? "10" : activePayAsset === "NARA" ? "0.01" : "0.005";
  const input = document.getElementById("buyModalAmountInput");
  if (input) input.value = modalAmount;
  hideTxReceiptBox();
  triggerModalQuote(true);
}

export function setBuyModalMax() {
  if (isExecutingSwap) return;
  soundClickFn();
  if (!connectedAccount || !balances.loaded) {
    setModalStatus("info", "Connect your Base wallet first to fill your maximum balance.");
    return;
  }
  const activePayAsset = modalDirection === "sell" ? "NARA" : modalAsset;
  if (activePayAsset === "ETH") {
    const usable = balances.ethWei > ETH_GAS_RESERVE_WEI ? balances.ethWei - ETH_GAS_RESERVE_WEI : 0n;
    const flooredEth = usable - (usable % 10_000_000_000n); // exact 8-decimal floor, never leaves trailing dot
    if (flooredEth <= 0n) {
      setModalStatus("warn", "ETH balance is below the 0.0003 ETH Base gas reserve.");
      return;
    }
    modalAmount = formatUnits(flooredEth, 18);
  } else if (activePayAsset === "USDC") {
    if (balances.usdcWei <= 0n) {
      setModalStatus("warn", "Your connected wallet has 0.00 USDC on Base.");
      return;
    }
    modalAmount = formatUnits(balances.usdcWei, 6);
  } else {
    if (balances.naraWei <= 0n) {
      setModalStatus("warn", "Your connected wallet has 0 NARA on Base.");
      return;
    }
    modalAmount = formatUnits(balances.naraWei, 18);
  }
  const input = document.getElementById("buyModalAmountInput");
  if (input) input.value = modalAmount;
  hideTxReceiptBox();
  triggerModalQuote(true);
}

export function setBuyModalSlippage(_e, bpsStr) {
  if (isExecutingSwap) return;
  soundClickFn();
  modalSlippageBps = Number(bpsStr) || V4_SWAP_CONSTANTS.defaultSlippageBps;
  renderModalControls();
  triggerModalQuote(true);
}

export function handleBuyModalAmountInput(e) {
  const input = e?.target;
  if (!input) return;
  const clean = sanitizeAmountInput(input.value);
  if (clean !== input.value) input.value = clean;
  modalAmount = clean;
  if (currentModalStatusKind === "error") setModalStatus("idle", "");
  hideTxReceiptBox();
  triggerModalQuote(false);
}

export function refreshBuyQuote() {
  soundClickFn();
  if (currentModalStatusKind === "error") setModalStatus("idle", "");
  if (connectedAccount) refreshConnectedBalances();
  triggerModalQuote(true);
}

// --- Transaction Receipt Poller & Safe Execution ---

async function waitForReceipt(provider, txHash, timeoutMs = 90000) {
  const started = Date.now();
  let pollCount = 0;
  while (Date.now() - started < timeoutMs) {
    pollCount++;
    let receipt = null;
    try {
      receipt = await provider.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      });
    } catch {
      receipt = null;
    }
    if (!receipt && pollCount >= 2) {
      try {
        receipt = await publicBaseRpcRequest("eth_getTransactionReceipt", [txHash]);
      } catch {
        receipt = null;
      }
    }
    if (receipt && receipt.status !== undefined && receipt.status !== null) {
      if (receipt.status === "0x1" || receipt.status === 1 || receipt.status === "1") {
        return receipt;
      }
      throw new Error("Transaction reverted on-chain. Check BaseScan for details.");
    }
    await new Promise((r) => setTimeout(r, 1400));
  }
  throw new Error("Transaction submitted — still awaiting Base block confirmation. Check BaseScan.");
}

async function getSafeChainNowSec(provider) {
  const localNow = Math.floor(Date.now() / 1000);
  try {
    let block = null;
    if (provider && connectedChainId === V4_SWAP_CONSTANTS.chainId) {
      block = await provider
        .request({ method: "eth_getBlockByNumber", params: ["latest", false] })
        .catch(() => null);
    }
    if (!block) {
      block = await publicBaseRpcRequest("eth_getBlockByNumber", ["latest", false]).catch(() => null);
    }
    const ts = block?.timestamp ? parseInt(String(block.timestamp), 16) : 0;
    if (Number.isFinite(ts) && ts > 1_700_000_000) {
      return Math.max(localNow, ts);
    }
  } catch {
    // Fall back to local clock
  }
  return localNow;
}

async function assertActiveSignerAndChain(provider, expectedSigner) {
  if (!connectedAccount || connectedAccount.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error("Active wallet account changed during confirmation. Review and try again.");
  }
  await ensureBaseChain(provider);
}

async function waitForErc20AllowanceSync(owner, token, spender, minAmountWei, maxWaitMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    try {
      const hex = await smartEthCall(token, encodeErc20Allowance(owner, spender));
      if (decodeFirstUint256(hex) >= minAmountWei) return;
    } catch {
      // Retry next tick
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function waitForPermit2AllowanceSync(owner, token, spender, minAmountWei, minExpSec, maxWaitMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    try {
      const hex = await smartEthCall(
        V4_SWAP_CONSTANTS.permit2,
        encodePermit2Allowance(owner, token, spender)
      );
      const p2 = decodePermit2Allowance(hex);
      if (p2.amount >= minAmountWei && p2.expiration > minExpSec) return;
    } catch {
      // Retry next tick
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function simulateUniversalRouterSwap(provider, txRequest) {
  const callObj = {
    from: txRequest.from,
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value,
  };

  let simErr = null;
  try {
    await provider.request({
      method: "eth_call",
      params: [callObj, "latest"],
    });
    return;
  } catch (err) {
    const msg = String(err?.shortMessage || err?.message || "");
    const code = err?.code ?? err?.data?.originalError?.code;
    if (
      code === 3 ||
      /execution reverted|revert|TooLittleReceived|V4TooLittleReceived|AllowanceExpired|InsufficientAllowance|insufficient funds/i.test(
        msg
      )
    ) {
      simErr = err;
    } else {
      // Wallet RPC might not support eth_call with value/data cleanly -> verify via public Base RPC
      try {
        await publicBaseRpcRequest("eth_call", [callObj, "latest"]);
        return;
      } catch (fallbackErr) {
        if (fallbackErr?.isRevert || /revert|TooLittleReceived|Allowance|insufficient/i.test(String(fallbackErr?.message || ""))) {
          simErr = fallbackErr;
        }
      }
    }
  }

  if (simErr) {
    const rawMsg = String(simErr?.shortMessage || simErr?.message || "");
    triggerModalQuote(true);
    if (/AllowanceExpired|InsufficientAllowance/i.test(rawMsg)) {
      throw new Error("Base RPC is still syncing your Permit2 approval. Wait 2 seconds and click Swap again.");
    }
    if (/insufficient funds/i.test(rawMsg)) {
      throw new Error("Insufficient Base ETH in wallet to cover swap value + L2 network gas.");
    }
    const slipTip = modalSlippageBps < 2000 ? " Quote refreshed — try 10%–20% slippage or a smaller clip." : " Quote refreshed — review and confirm again.";
    throw new Error(
      `Safety simulation blocked a reverting swap (pool price or block-surge fee shifted).${slipTip}`
    );
  }
}

export async function executeBuyModalSwap() {
  if (isExecutingSwap) return;
  soundClickFn();

  if (!connectedAccount || !activeWalletEntry?.provider) {
    await connectBuyWallet();
    return;
  }

  const provider = activeWalletEntry.provider;
  const signerAccount = connectedAccount;
  if (!isValidAddress(signerAccount)) {
    setModalStatus("error", "Invalid connected wallet address. Reconnect your wallet.");
    return;
  }

  if (connectedChainId !== V4_SWAP_CONSTANTS.chainId) {
    try {
      await ensureBaseChain(provider);
      await refreshConnectedBalances();
      triggerModalQuote(true);
    } catch (err) {
      setModalStatus("error", formatWalletError(err));
    }
    return;
  }

  const activePayAsset = modalDirection === "sell" ? "NARA" : modalAsset;
  const decimalsIn = activePayAsset === "USDC" ? 6 : 18;
  let amountInWei;
  try {
    amountInWei = parseUnits(modalAmount, decimalsIn);
  } catch {
    setModalStatus("error", "Enter a valid numeric swap amount.");
    return;
  }
  if (amountInWei <= 0n) {
    setModalStatus("error", "Enter an amount greater than zero.");
    return;
  }

  isExecutingSwap = true;
  hideTxReceiptBox();
  const submitLabel = document.getElementById("buyModalSubmitLabel");
  updateModalSubmitButton();

  try {
    if (submitLabel) submitLabel.textContent = "VERIFYING BASE CHAIN & BALANCES…";
    await assertActiveSignerAndChain(provider, signerAccount);
    await refreshConnectedBalances();

    if (balances.loaded) {
      if (activePayAsset === "ETH") {
        if (balances.ethWei < amountInWei) {
          throw new Error(`Insufficient Base ETH balance (have ${formatEthDisplay(balances.ethWei)} ETH).`);
        }
        if (balances.ethWei < amountInWei + MIN_GAS_CHECK_WEI) {
          throw new Error("Leave at least 0.00005 ETH in your wallet for Base L2 network gas.");
        }
      } else if (activePayAsset === "USDC") {
        if (balances.usdcWei < amountInWei) {
          throw new Error(`Insufficient Base USDC balance (have $${formatDisplayUsdc(balances.usdcWei)} USDC).`);
        }
        if (balances.ethWei < MIN_GAS_CHECK_WEI) {
          throw new Error("You need a small amount of Base ETH (~$0.05) for L2 gas, or use CryptoSLIP gasless slips.");
        }
      } else {
        if (balances.naraWei < amountInWei) {
          throw new Error(`Insufficient $NARA balance (have ${formatDisplayNara(balances.naraWei)} NARA).`);
        }
        if (balances.ethWei < MIN_GAS_CHECK_WEI) {
          throw new Error("You need a small amount of Base ETH (~$0.05) for L2 gas.");
        }
      }
    }

    if (submitLabel) submitLabel.textContent = "LOCKING FRESH V4 HOOK QUOTE…";
    const freshQuote = await fetchSwapQuote({
      direction: modalDirection,
      asset: activePayAsset,
      amountStr: modalAmount,
      slippageBps: modalSlippageBps,
      bypassEdgeCache: true,
    });

    if (!freshQuote.tradingOpen) {
      throw new Error("Trading on NARALiquidityHookV5 is currently paused.");
    }
    const minOutWei = BigInt(freshQuote.minOutWei || "0");
    if (minOutWei <= 0n) {
      throw new Error("Live pool quote returned zero output.");
    }
    modalQuote = freshQuote;

    const chainNowSec = await getSafeChainNowSec(provider);
    const deadlineSec = BigInt(chainNowSec + 1200); // 20-minute execution deadline anchored to Base block time

    let swapTxPayload;

    if (modalDirection === "buy" && activePayAsset === "ETH") {
      const minUsdcWei = BigInt(freshQuote.intermediateUsdcWei || "0");
      if (minUsdcWei <= 0n) throw new Error("ETH bridge quote returned zero intermediate USDC.");
      swapTxPayload = encodeEthToNaraUniversalRouter(
        amountInWei,
        signerAccount,
        minUsdcWei,
        minOutWei,
        deadlineSec
      );
      if (BigInt(swapTxPayload.valueHex) !== amountInWei) {
        throw new Error("Internal safety check failed: ETH value mismatch.");
      }
    } else {
      const isBuy = modalDirection === "buy";
      const tokenIn = isBuy ? V4_SWAP_CONSTANTS.usdc : V4_SWAP_CONSTANTS.nara;
      const tokenSymbol = isBuy ? "USDC" : "$NARA";

      // Step A: Exact ERC-20 allowance to Permit2 (never infinite MaxUint256)
      const erc20AllowHex = await smartEthCall(
        tokenIn,
        encodeErc20Allowance(signerAccount, V4_SWAP_CONSTANTS.permit2)
      );
      const currentErc20Allowance = decodeFirstUint256(erc20AllowHex);
      if (currentErc20Allowance < amountInWei) {
        await assertActiveSignerAndChain(provider, signerAccount);
        if (submitLabel) submitLabel.textContent = `STEP 1/3 · APPROVE ${tokenSymbol} IN WALLET…`;
        setModalStatus("info", `Approve exact ${freshQuote.amountIn} ${tokenSymbol} for Uniswap Permit2 in your wallet.`);
        const approveHash = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              chainId: BASE_CHAIN_ID_HEX,
              from: signerAccount,
              to: tokenIn,
              data: encodeErc20Approve(V4_SWAP_CONSTANTS.permit2, amountInWei),
              value: "0x0",
            },
          ],
        });
        if (submitLabel) submitLabel.textContent = "CONFIRMING TOKEN APPROVAL…";
        await waitForReceipt(provider, approveHash);
        await waitForErc20AllowanceSync(signerAccount, tokenIn, V4_SWAP_CONSTANTS.permit2, amountInWei);
      }

      // Step B: Exact Permit2 allowance to UniversalRouter (1-hour expiry anchored to Base block time)
      const latestNowSec = await getSafeChainNowSec(provider);
      const p2AllowHex = await smartEthCall(
        V4_SWAP_CONSTANTS.permit2,
        encodePermit2Allowance(signerAccount, tokenIn, V4_SWAP_CONSTANTS.universalRouter)
      );
      const p2Allow = decodePermit2Allowance(p2AllowHex);
      if (p2Allow.amount < amountInWei || p2Allow.expiration <= latestNowSec + 120) {
        await assertActiveSignerAndChain(provider, signerAccount);
        if (submitLabel) submitLabel.textContent = `STEP 2/3 · AUTHORIZE PERMIT2 ROUTER…`;
        setModalStatus("info", `Confirm 1-hour Permit2 spending cap for Universal Router in your wallet.`);
        const p2ExpSec = latestNowSec + 3600;
        const p2Hash = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              chainId: BASE_CHAIN_ID_HEX,
              from: signerAccount,
              to: V4_SWAP_CONSTANTS.permit2,
              data: encodePermit2Approve(
                tokenIn,
                V4_SWAP_CONSTANTS.universalRouter,
                amountInWei,
                p2ExpSec
              ),
              value: "0x0",
            },
          ],
        });
        if (submitLabel) submitLabel.textContent = "CONFIRMING PERMIT2 CAP…";
        await waitForReceipt(provider, p2Hash);
        await waitForPermit2AllowanceSync(
          signerAccount,
          tokenIn,
          V4_SWAP_CONSTANTS.universalRouter,
          amountInWei,
          latestNowSec + 60
        );
      }

      const postApproveNowSec = await getSafeChainNowSec(provider);
      swapTxPayload = encodeV4HookSwapUniversalRouter(
        isBuy,
        amountInWei,
        minOutWei,
        BigInt(postApproveNowSec + 1200),
        signerAccount
      );
      if (swapTxPayload.valueHex !== "0x0") {
        throw new Error("Internal safety check failed: ERC-20 swap must send 0 native ETH.");
      }
    }

    if (swapTxPayload.to.toLowerCase() !== V4_SWAP_CONSTANTS.universalRouter.toLowerCase()) {
      throw new Error("Internal safety check failed: router target mismatch.");
    }

    await assertActiveSignerAndChain(provider, signerAccount);

    const finalTxRequest = {
      chainId: BASE_CHAIN_ID_HEX,
      from: signerAccount,
      to: swapTxPayload.to,
      data: swapTxPayload.data,
      value: swapTxPayload.valueHex,
    };

    if (submitLabel) submitLabel.textContent = "SIMULATING SWAP ON BASE MAINNET…";
    await simulateUniversalRouterSwap(provider, finalTxRequest);

    if (submitLabel) submitLabel.textContent = "CONFIRM SWAP IN YOUR WALLET…";
    setModalStatus("info", "Simulation passed ✓ Confirm the Uniswap v4 NARA V5 Hook swap in your wallet.");

    const txHash = await provider.request({
      method: "eth_sendTransaction",
      params: [finalTxRequest],
    });

    if (submitLabel) submitLabel.textContent = "CONFIRMING ON BASE MAINNET…";
    setModalStatus("info", `Broadcasted ${txHash.slice(0, 10)}… Waiting for Base confirmation (~2s)…`);

    await waitForReceipt(provider, txHash);

    soundSuccessFn();
    setModalStatus("idle", "");
    const summaryLine =
      modalDirection === "sell"
        ? `Sold ${freshQuote.amountIn} $NARA → ~$${freshQuote.expectedOutDisplay} USDC on Base`
        : `Bought ~${freshQuote.expectedOutDisplay} $NARA with ${freshQuote.amountIn} ${activePayAsset} on Base`;
    showTxReceiptBox(txHash, summaryLine);

    await refreshConnectedBalances();
    refreshHeroMarketTelemetry();
  } catch (err) {
    setModalStatus("error", formatWalletError(err));
  } finally {
    isExecutingSwap = false;
    updateModalSubmitButton();
  }
}

export function initBuyExperience({ playClick, playSuccess, copyCA, onModalVisibilityChange }) {
  soundClickFn = playClick || (() => {});
  soundSuccessFn = playSuccess || (() => {});
  copyCaFn = copyCA || (() => {});
  modalVisibilityChangeFn = onModalVisibilityChange || (() => {});

  // Hydrate preset labels cleanly just in case
  void PRESETS;
  void NARA_CONTRACT;

  discoverInjectedWallets();
  refreshHeroMarketTelemetry();

  // Deep-link support: https://naraprotocol.io/?buy=1 or #buy
  try {
    const url = new URL(window.location.href);
    const wantsBuy =
      url.searchParams.get("buy") === "1" ||
      url.hash === "#buy" ||
      url.hash === "#buy-nara";
    if (wantsBuy) {
      url.searchParams.delete("buy");
      if (url.hash === "#buy" || url.hash === "#buy-nara") url.hash = "";
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      setTimeout(() => openBuyModal(), 60);
    }
  } catch {
    // Ignore URL parse errors
  }
}
