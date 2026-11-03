// Public, non-secret constants for the NARA meme landing page.
// Everything here ships to the browser. Never put secrets in this file.

export const NARA_CONTRACT = "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f";
export const NARA_SYMBOL = "NARA";
export const NARA_DECIMALS = 18;
export const BASE_CHAIN_ID_HEX = "0x2105"; // 8453

// Canonical public origin. Share links, OG tags and card footers use this.
export const CANONICAL_URL = "https://naraprotocol.com/";
export const NARA_IMAGE = `${CANONICAL_URL}nara_token_256.png`;

// SWAP destination: CryptoSLIP, the NARA swap app (opens in a new tab).
export const CRYPTOSLIP_URL = "https://cryptoslip.eth.limo/";

// Launch gate. Flip to true in a commit AFTER Safe nonce 8 (Hook.setTradingPaused(false))
// executes and `verifyV5Launch.ts --phase V4` passes. While false, SWAP opens the
// pre-launch modal instead of CryptoSLIP.
export const SWAP_PUBLIC_LAUNCHED = false;

// Cloudflare Turnstile site key (public). Empty string disables global board posting:
// scores then save on this device only. Set VITE_TURNSTILE_SITE_KEY at build time.
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
