// Dedicated lightweight controller for /vault (Wave 1 Vault Receipts & Spot Terminal).
// Zero arcade physics or local sticker collection overhead; shares the exact verified
// NARAPositionSaleV5 BuyerBounds + Uniswap v4 Hook modules with the home page.

import {
  NARA_CONTRACT,
  NARA_SYMBOL,
  NARA_DECIMALS,
  NARA_IMAGE,
  BASE_CHAIN_ID_HEX,
  CANONICAL_URL,
  resolveCryptoSlipBuyUrl,
  SWAP_PUBLIC_LAUNCHED,
} from "./config.js";
import { notifyMiniAppHostReady } from "./erc8021.js";
import {
  initBuyExperience,
  isBuyModalOpen,
  openBuyModal,
  closeBuyModal,
  copyBuyModalCA,
  setBuyModalDirection,
  setBuyModalAsset,
  setBuyModalPreset,
  setBuyModalMax,
  setBuyModalSlippage,
  handleBuyModalAmountInput,
  disconnectBuyWallet,
  getConnectedWalletProvider,
  applyLowFeeSwapSize,
  refreshBuyQuote,
  executeBuyModalSwap,
} from "./buyModal.js";
import {
  initAnchorSeats,
  refreshAnchorSeats,
  selectAnchorSeat,
  setAnchorTierFilter,
  cancelSeatReview,
  copySeatLink,
  toggleAnchorSpecs,
  toggleCardHelp,
  buyAnchorSeat,
  jumpToAnchorSeats,
  getAnchorShowcaseSummary,
} from "./anchorSeats.js";

let audioCtx = null;
let isWalletRequestPending = false;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playClick() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(680, t);
    osc.frequency.exponentialRampToValueAtTime(250, t + 0.022);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.035, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.026);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.03);
  } catch {
    // Audio optional
  }
}

function playSuccess() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + i * 0.06);
      gain.gain.setValueAtTime(0.0001, t + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.05, t + i * 0.06 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.2);
    });
  } catch {
    // Audio optional
  }
}

function syncBodyScrollLock() {
  if (typeof document === "undefined") return;
  const modalIds = ["swapPrelaunchModal", "buyNaraModal", "anchorCardHelpModal", "anchorSeatReviewDrawer"];
  const anyOpen = modalIds.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
  document.body.classList.toggle("overflow-hidden", anyOpen);
}

function openSafeWindow(url) {
  if (!url) return;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
  } catch {
    window.location.href = url;
  }
}

function handleSwapButtonClick(e) {
  playClick();
  if (SWAP_PUBLIC_LAUNCHED) {
    const isAnchor = !!(e && e.currentTarget && e.currentTarget.tagName === "A");
    if (!isAnchor) openSafeWindow(resolveCryptoSlipBuyUrl());
    return;
  }
  if (e && e.preventDefault) e.preventDefault();
  const modal = document.getElementById("swapPrelaunchModal");
  if (modal) {
    modal.classList.remove("hidden");
    syncBodyScrollLock();
  }
}

function initSwapControl() {
  const el = document.getElementById("headerSwapBtn");
  if (!el || !SWAP_PUBLIC_LAUNCHED) return;
  const a = document.createElement("a");
  a.id = el.id;
  a.className = `${el.className} no-underline`;
  a.href = resolveCryptoSlipBuyUrl();
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = "Swap on CryptoSLIP, the NARA swap app (opens in a new tab)";
  a.setAttribute("aria-label", "Swap on CryptoSLIP, opens in a new tab");
  a.setAttribute("data-on-click", "handleSwapButtonClick");
  while (el.firstChild) a.appendChild(el.firstChild);
  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.className = "hidden sm:inline text-[11px] opacity-70";
  mark.textContent = "↗";
  a.appendChild(mark);
  el.replaceWith(a);
}

function closeSwapModal(e) {
  if (e) e.stopPropagation();
  playClick();
  const modal = document.getElementById("swapPrelaunchModal");
  if (modal) {
    modal.classList.add("hidden");
    syncBodyScrollLock();
  }
}

function copyTextFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    // Ignore fallback copy failure
  }
  document.body.removeChild(ta);
}

function copyCA() {
  playClick();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(NARA_CONTRACT).catch(() => copyTextFallback(NARA_CONTRACT));
  } else {
    copyTextFallback(NARA_CONTRACT);
  }
  const btnText = document.getElementById("copyBtnText");
  if (btnText) {
    btnText.textContent = "Copied";
    btnText.classList.add("text-emerald-300");
    setTimeout(() => {
      btnText.textContent = "Copy";
      btnText.classList.remove("text-emerald-300");
    }, 2400);
  }
}

function getEthereumProvider() {
  const connected = getConnectedWalletProvider();
  if (connected && typeof connected.request === "function") return connected;
  if (typeof window === "undefined" || !window.ethereum) return null;
  if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
    return window.ethereum.providers.find((p) => p && p.isMetaMask) || window.ethereum.providers[0];
  }
  return window.ethereum;
}

async function addNaraToMetaMask() {
  if (isWalletRequestPending) return;
  playClick();
  const label = document.getElementById("mmBtnLabel");
  const receiptBtn = document.getElementById("buyReceiptWatchBtn");
  const provider = getEthereumProvider();
  if (provider && typeof provider.request === "function") {
    isWalletRequestPending = true;
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        const errCode = switchError?.code ?? switchError?.data?.originalError?.code;
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
          throw switchError;
        }
      }

      const wasAdded = await provider.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: NARA_CONTRACT,
            symbol: NARA_SYMBOL,
            decimals: NARA_DECIMALS,
            image: NARA_IMAGE,
          },
        },
      });
      if (wasAdded) {
        if (label) {
          label.textContent = "Token Added";
          label.classList.add("text-emerald-300");
          setTimeout(() => {
            label.textContent = "Add $NARA to MetaMask";
            label.classList.remove("text-emerald-300");
          }, 3000);
        }
        if (receiptBtn) {
          receiptBtn.textContent = "✓ $NARA in Wallet";
          setTimeout(() => {
            receiptBtn.textContent = "+ Show $NARA in Wallet";
          }, 3000);
        }
      }
    } catch {
      copyCA();
      if (label) {
        label.textContent = "CA COPIED TO CLIPBOARD";
        setTimeout(() => {
          label.textContent = "Add $NARA to MetaMask";
        }, 3000);
      }
      if (receiptBtn) {
        receiptBtn.textContent = "CA Copied ✓";
        setTimeout(() => {
          receiptBtn.textContent = "+ Show $NARA in Wallet";
        }, 3000);
      }
    } finally {
      isWalletRequestPending = false;
    }
  } else {
    copyCA();
    if (label) {
      label.textContent = "CA COPIED TO CLIPBOARD";
      setTimeout(() => {
        label.textContent = "Add $NARA to MetaMask";
      }, 3000);
    }
    if (receiptBtn) {
      receiptBtn.textContent = "CA Copied ✓";
      setTimeout(() => {
        receiptBtn.textContent = "+ Show $NARA in Wallet";
      }, 3000);
    }
  }
}

function rfc3986Encode(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildVaultShareUrls() {
  const summary = getAnchorShowcaseSummary();
  const shareUrl = `${CANONICAL_URL.replace(/\/$/, "")}/s/vault`;
  const entryEth = summary.minEthDisplay || "1.61";
  const priceLine =
    summary.spotUsdPerNara && summary.maxDiscountPct && summary.maxDiscountPct >= 8
      ? `• Wave 1 from ${entryEth} ETH (up to -${summary.maxDiscountPct}% vs $${Math.round(summary.spotUsdPerNara).toLocaleString("en-US")} v4 spot on larger tiers)`
      : `• Wave 1 entry from ${entryEth} ETH (Wave 2 steps up +15%)`;
  const chestLine = summary.totalAccruedNaraDisplay
    ? `• +${summary.totalAccruedNaraDisplay} $NARA accrued inside chests`
    : "• 900s $NARA pulses + ETH/USDC cash stack inside each receipt";
  const text = `Wave 1 $NARA Vault Receipts on Base (@NARA_protocol):\n\n${priceLine}\n• 0% AMM slippage · 90d–365d across 6 tiers (up to 18x pulse share)\n${chestLine}\n\nInspect 29 Wave 1 vaults 👇`;
  return {
    xUrl: `https://x.com/intent/post?text=${rfc3986Encode(text)}&url=${rfc3986Encode(shareUrl)}`,
    castUrl: `https://warpcast.com/~/compose?text=${rfc3986Encode(text)}&embeds[]=${rfc3986Encode(shareUrl)}`,
  };
}

function shareVaultOnX(e) {
  playClick();
  const { xUrl } = buildVaultShareUrls();
  if (e && e.currentTarget && e.currentTarget.tagName === "A") {
    e.currentTarget.href = xUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(xUrl);
  }
}

function shareVaultOnCast(e) {
  playClick();
  const { castUrl } = buildVaultShareUrls();
  if (e && e.currentTarget && e.currentTarget.tagName === "A") {
    e.currentTarget.href = castUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(castUrl);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") {
    const swapModal = document.getElementById("swapPrelaunchModal");
    if (isBuyModalOpen()) {
      closeBuyModal();
    } else if (swapModal && !swapModal.classList.contains("hidden")) {
      closeSwapModal();
    }
  }
});

const ACTIONS = {
  stopPropagation: (e) => e.stopPropagation(),
  openBuyModal: () => openBuyModal(),
  closeBuyModal: (e) => closeBuyModal(e),
  closeBuyModalBackdrop: (e) => closeBuyModal(e),
  copyBuyModalCA: () => copyBuyModalCA(),
  setBuyModalDirection: (e, arg) => setBuyModalDirection(e, arg),
  setBuyModalAsset: (e, arg) => setBuyModalAsset(e, arg),
  setBuyModalPreset: (e, arg) => setBuyModalPreset(e, arg),
  setBuyModalMax: () => setBuyModalMax(),
  setBuyModalSlippage: (e, arg) => setBuyModalSlippage(e, arg),
  handleBuyModalAmountInput: (e) => handleBuyModalAmountInput(e),
  disconnectBuyWallet: () => disconnectBuyWallet(),
  refreshBuyQuote: () => refreshBuyQuote(),
  executeBuyModalSwap: () => executeBuyModalSwap(),
  applyLowFeeSwapSize: () => applyLowFeeSwapSize(),
  handleSwapButtonClick: (e) => handleSwapButtonClick(e),
  closeSwapModalBackdrop: (e) => closeSwapModal(e),
  closeSwapModal: () => closeSwapModal(),
  copyCA: () => copyCA(),
  addNaraToMetaMask: () => addNaraToMetaMask(),
  shareVaultOnX: (e) => shareVaultOnX(e),
  shareVaultOnCast: (e) => shareVaultOnCast(e),
  refreshAnchorSeats: () => refreshAnchorSeats(true),
  selectAnchorSeat: (e, arg) => selectAnchorSeat(e, arg),
  setAnchorTierFilter: (e, arg) => setAnchorTierFilter(e, arg),
  cancelSeatReview: (e) => cancelSeatReview(e),
  copySeatLink: (e, arg) => copySeatLink(e, arg),
  toggleAnchorSpecs: (e) => toggleAnchorSpecs(e),
  toggleCardHelp: (e, arg) => toggleCardHelp(e, arg),
  buyAnchorSeat: (e, arg) => buyAnchorSeat(e, arg),
  jumpToAnchorSeats: () => jumpToAnchorSeats(),
};

const BOUND_EVENTS = ["click", "keydown", "mouseenter", "touchstart", "input"];
const boundActionElements = new WeakSet();

function bindActions(root = document) {
  const selector = BOUND_EVENTS.map((evt) => `[data-on-${evt}]`).join(",");
  const unknown = [];
  root.querySelectorAll(selector).forEach((el) => {
    if (boundActionElements.has(el)) return;
    boundActionElements.add(el);
    BOUND_EVENTS.forEach((evt) => {
      const spec = el.getAttribute(`data-on-${evt}`);
      if (!spec) return;
      const [name, arg] = spec.split(":");
      const action = ACTIONS[name];
      if (!action) {
        unknown.push(`${evt}:${name}`);
        return;
      }
      const options = evt === "touchstart" ? { passive: true } : undefined;
      el.addEventListener(evt, (e) => action(e, arg), options);
    });
  });
  if (unknown.length) {
    document.documentElement.setAttribute("data-nara-bind-error", unknown.join(","));
    console.error(`[nara-vault] unknown actions: ${unknown.join(", ")}`);
    throw new Error(`[nara-vault] unknown actions: ${unknown.join(", ")}`);
  }
}

notifyMiniAppHostReady();
initSwapControl();
bindActions();

initBuyExperience({
  playClick,
  playSuccess,
  copyCA,
  onModalVisibilityChange: syncBodyScrollLock,
});

initAnchorSeats({
  bindActions,
  playClick,
  playSuccess,
  onModalVisibilityChange: syncBodyScrollLock,
});
