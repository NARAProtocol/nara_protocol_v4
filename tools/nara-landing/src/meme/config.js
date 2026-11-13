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
export const SWAP_PUBLIC_LAUNCHED = true;

// Cloudflare Turnstile public site key. Read from the build environment so preview and
// production can use separate keys; when unset, Fame Board submission stays device-local
// and the UI says so honestly instead of failing silently.
export const TURNSTILE_SITE_KEY = (import.meta.env?.VITE_TURNSTILE_SITE_KEY || "").trim();
