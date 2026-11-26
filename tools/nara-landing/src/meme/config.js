// Public configuration for naraprotocol.io.
// Everything here ships to the browser — never put secrets in this file.

export const NARA_CONTRACT = "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f";
export const NARA_SYMBOL = "NARA";
export const NARA_DECIMALS = 18;
export const BASE_CHAIN_ID_HEX = "0x2105"; // Base mainnet (8453)

export const CANONICAL_URL = "https://naraprotocol.io";
export const NARA_IMAGE = `${CANONICAL_URL}/nara_token_256.png`;

// CryptoSLIP (swap, commit NARA & $0-gas payment slips app). Deep-linked directly to the NARA tab / Buy sheet.
export const CRYPTOSLIP_BASE_URL = "https://slip.naraprotocol.io";
export const CRYPTOSLIP_URL = `${CRYPTOSLIP_BASE_URL}/?tab=nara&action=buy`;
export const CRYPTOSLIP_COMMIT_URL = `${CRYPTOSLIP_BASE_URL}/?tab=nara`;
export const CRYPTOSLIP_SLIPS_URL = `${CRYPTOSLIP_BASE_URL}/`;
export const CRYPTOSLIP_TG_BUY_URL = "https://t.me/cryptoslip_bot/SLIP?startapp=buy_nara";
export const CRYPTOSLIP_TG_COMMIT_URL = "https://t.me/cryptoslip_bot/SLIP?startapp=nara";
export const SWAP_PUBLIC_LAUNCHED = true;

/**
 * Returns true when running inside a Telegram WebView (either the Telegram iOS/Android
 * link viewer or Mini App container) so CryptoSLIP links launch the native Telegram
 * Mini App instead of opening an isolated Telegram in-app browser storage jar.
 */
export function isTelegramWebView(
  win = typeof window !== "undefined" ? window : undefined,
  nav = typeof navigator !== "undefined" ? navigator : undefined,
) {
  if (win) {
    if (typeof win.TelegramWebviewProxy !== "undefined" || typeof win.TelegramWebview !== "undefined") {
      return true;
    }
    if (win.Telegram?.WebApp?.initData) {
      return true;
    }
  }
  const ua = typeof nav?.userAgent === "string" ? nav.userAgent : "";
  return /\bTelegram(?:[-/\s]|$)|TDesktop|TelegramBot/i.test(ua);
}

export function resolveCryptoSlipBuyUrl(win, nav) {
  return isTelegramWebView(win, nav) ? CRYPTOSLIP_TG_BUY_URL : CRYPTOSLIP_URL;
}

export function resolveCryptoSlipCommitUrl(win, nav) {
  return isTelegramWebView(win, nav) ? CRYPTOSLIP_TG_COMMIT_URL : CRYPTOSLIP_COMMIT_URL;
}

// Cloudflare Turnstile public site key. Read from the build environment so preview and
// production can use separate keys; when unset, Fame Board submission stays device-local
// and the UI says so honestly instead of failing silently.
export const TURNSTILE_SITE_KEY = (import.meta.env?.VITE_TURNSTILE_SITE_KEY || "").trim();

// Canonical ERC-8021 Base Builder Code for NARA Protocol from dashboard.base.org (`bc_g71jff6u`).
export const DEFAULT_NARA_BUILDER_CODE = "bc_g71jff6u";
export const BASE_BUILDER_CODE = (
  import.meta.env?.VITE_BASE_BUILDER_CODE ?? DEFAULT_NARA_BUILDER_CODE
).trim();
