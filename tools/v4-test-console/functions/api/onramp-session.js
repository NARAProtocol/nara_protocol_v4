import { createPublicClient, http } from "viem";

const CDP_HOST = "api.developer.coinbase.com";
const CDP_PATH = "/onramp/v1/token";
const SESSION_URL = `https://${CDP_HOST}${CDP_PATH}`;
const CHALLENGE_TTL_SECONDS = 300;
const RATE_WINDOW_SECONDS = 600;
const MAX_SESSIONS_PER_WINDOW = 5;

function json(value, status = 200, origin = null) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function configured(env) {
  return !!(
    env.CDP_API_KEY_ID
    && env.CDP_API_KEY_SECRET
    && env.ONRAMP_STATE
    && env.BASE_RPC_URL
  );
}

function validAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function allowedAsset(value) {
  return value === "ETH" || value === "USDC";
}

function requestOrigin(request) {
  return new URL(request.url).origin;
}

function hasSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === requestOrigin(request);
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  return fetchSite === "same-origin" || fetchSite === "none";
}

function randomHex(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function buildFundingMessage({ origin, address, nonce, expiresAt }) {
  return [
    "NARA v4 funding request",
    "",
    `Site: ${origin}`,
    `Wallet: ${address.toLowerCase()}`,
    "Network: Base (8453)",
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "This signature requests a Coinbase funding session. It does not submit a blockchain transaction.",
  ].join("\n");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToBytes(pem) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function buildCoinbaseJwt({ keyId, keySecret, now = Math.floor(Date.now() / 1_000) }) {
  const header = {
    alg: "ES256",
    typ: "JWT",
    kid: keyId,
    nonce: randomHex(16),
  };
  const payload = {
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    sub: keyId,
    uri: `POST ${CDP_HOST}${CDP_PATH}`,
  };
  const encoded = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(keySecret),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${base64Url(new Uint8Array(signature))}`;
}

async function hashKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function consumeRateLimit(env, address, clientIp) {
  const bucket = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1_000));
  const key = `rate:${await hashKey(`${address.toLowerCase()}:${clientIp}:${bucket}`)}`;
  const current = Number(await env.ONRAMP_STATE.get(key) || "0");
  if (current >= MAX_SESSIONS_PER_WINDOW) return false;
  await env.ONRAMP_STATE.put(key, String(current + 1), { expirationTtl: RATE_WINDOW_SECONDS * 2 });
  return true;
}

async function createChallenge(request, env, address) {
  const origin = requestOrigin(request);
  const nonce = randomHex();
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1_000;
  const message = buildFundingMessage({ origin, address, nonce, expiresAt });
  await env.ONRAMP_STATE.put(
    `challenge:${nonce}`,
    JSON.stringify({ address: address.toLowerCase(), origin, expiresAt, message }),
    { expirationTtl: CHALLENGE_TTL_SECONDS },
  );
  return json({ nonce, message, expiresAt }, 200, origin);
}

async function createSession(request, env) {
  const origin = requestOrigin(request);
  if (!hasSameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403, origin);
  if (!configured(env)) return json({ error: "Coinbase funding is not configured." }, 503, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400, origin);
  }
  if (!validAddress(body.address) || !allowedAsset(body.asset)) {
    return json({ error: "Address or funding asset is invalid." }, 400, origin);
  }
  if (typeof body.nonce !== "string" || typeof body.message !== "string" || typeof body.signature !== "string") {
    return json({ error: "Wallet authentication is incomplete." }, 400, origin);
  }

  const challengeKey = `challenge:${body.nonce}`;
  const storedRaw = await env.ONRAMP_STATE.get(challengeKey);
  await env.ONRAMP_STATE.delete(challengeKey);
  if (!storedRaw) return json({ error: "Funding request expired. Start again." }, 401, origin);

  let stored;
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    return json({ error: "Funding request is invalid. Start again." }, 401, origin);
  }
  if (
    stored.address !== body.address.toLowerCase()
    || stored.origin !== origin
    || stored.message !== body.message
    || stored.expiresAt < Date.now()
  ) {
    return json({ error: "Funding request does not match this wallet." }, 401, origin);
  }

  const signatureValid = await createPublicClient({
    transport: http(env.BASE_RPC_URL),
  }).verifyMessage({
    address: body.address,
    message: body.message,
    signature: body.signature,
  }).catch(() => false);
  if (!signatureValid) return json({ error: "Wallet signature could not be verified." }, 401, origin);

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (!clientIp) return json({ error: "Client network could not be verified." }, 400, origin);
  if (!(await consumeRateLimit(env, body.address, clientIp))) {
    return json({ error: "Funding session limit reached. Try again later." }, 429, origin);
  }

  let jwt;
  try {
    jwt = await buildCoinbaseJwt({
      keyId: env.CDP_API_KEY_ID,
      keySecret: env.CDP_API_KEY_SECRET,
    });
  } catch {
    return json({ error: "Coinbase funding credentials are unavailable." }, 503, origin);
  }

  const response = await fetch(SESSION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addresses: [{ address: body.address, blockchains: ["base"] }],
      assets: [body.asset],
      clientIp,
    }),
  });
  if (!response.ok) {
    return json({ error: "Coinbase could not create a funding session." }, 502, origin);
  }
  const result = await response.json();
  if (typeof result.token !== "string" || !result.token) {
    return json({ error: "Coinbase returned an invalid funding session." }, 502, origin);
  }

  const url = new URL("https://pay.coinbase.com/buy/select-asset");
  url.searchParams.set("sessionToken", result.token);
  url.searchParams.set("defaultNetwork", "base");
  url.searchParams.set("defaultAsset", body.asset);
  url.searchParams.set("partnerUserRef", `nara-${body.nonce.slice(0, 24)}`);
  url.searchParams.set("redirectUrl", `${origin}/?funding=complete`);
  return json({ url: url.toString() }, 200, origin);
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") {
    if (!hasSameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403, origin);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "no-store",
        Vary: "Origin",
      },
    });
  }
  if (request.method === "GET") {
    if (!hasSameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403, origin);
    if (!configured(env)) return json({ available: false }, 200, origin);
    const address = new URL(request.url).searchParams.get("address");
    if (!address) return json({ available: true }, 200, origin);
    if (!validAddress(address)) return json({ error: "Wallet address is invalid." }, 400, origin);
    return createChallenge(request, env, address);
  }
  if (request.method === "POST") return createSession(request, env);
  return json({ error: "Method not allowed." }, 405, origin);
}
