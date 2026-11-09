// Public, non-secret constants for the NARA meme landing page.
// Everything here ships to the browser. Never put secrets in this file.

export const NARA_CONTRACT = "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f";
export const NARA_SYMBOL = "NARA";
export const NARA_DECIMALS = 18;
export const BASE_CHAIN_ID_HEX = "0x2105"; // 8453

// Canonical public origin. Share links, OG tags and card footers use this.
export const CANONICAL_URL = "https://naraprotocol.io/";
export const NARA_IMAGE = `${CANONICAL_URL}nara_token_256.png`;

// SWAP destination: CryptoSLIP, the NARA swap app (opens in a new tab).
export const CRYPTOSLIP_URL = "https://cryptoslip-g29s.4everland.app/?v=cs-1794196154337";

// Launch gate. When true, SWAP opens CryptoSLIP directly in a new tab.
export const SWAP_PUBLIC_LAUNCHED = true;

// Cloudflare Turnstile site key (public, widget `naraprotocol-fame-board`).
// Override with VITE_TURNSTILE_SITE_KEY="" to force device-only mode.
export const TURNSTILE_SITE_KEY = (
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "0x4AAAAAAFw9wVG5-tTcQGo1"
).trim();
