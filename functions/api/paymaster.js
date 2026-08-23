import { createPublicClient, http, keccak256 } from "viem";

import {
  BASE_CHAIN_ID_HEX,
  decodeUserOperationCalls,
  ENTRY_POINT_V06,
  sponsoredCallsHash,
  userOperationFingerprint,
  validateSponsoredCalls,
} from "../_shared/nara-paymaster-policy.js";

const CHALLENGE_TTL_SECONDS = 300;
const TICKET_TTL_SECONDS = 600;
const RATE_WINDOW_SECONDS = 3_600;
const MAX_TICKETS_PER_WINDOW = 12;
const MAX_BODY_BYTES = 96_000;
const PAYMASTER_METHODS = new Set(["pm_getPaymasterStubData", "pm_getPaymasterData"]);
const BASE_ACCOUNT_IMPLEMENTATION = "0x00000110dcdedc9581cb5ecb8467282f2926534d";
const BASE_ACCOUNT_IMPLEMENTATION_CODE_HASH = "0x136185896fc519277ec953c0b3d048fc0c9f607b8d04022e60f23ef8dbc6c4d5";
const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

function json(value, status = 200, corsOrigin = null) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (corsOrigin) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function rpcError(id, code, message, status = 400) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status, "*");
}

function validPaymasterUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "api.developer.coinbase.com"
      && url.pathname.startsWith("/rpc/v1/base/");
  } catch {
    return false;
  }
}

function configured(env) {
  return !!(
    validPaymasterUrl(env.CDP_PAYMASTER_URL)
    && env.PAYMASTER_STATE
    && env.BASE_RPC_URL
  );
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

function validAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function randomHex(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export function buildSponsorshipMessage({ origin, address, callsHash, nonce, expiresAt }) {
  return [
    "NARA v4 gas sponsorship request",
    "",
    `Site: ${origin}`,
    `Wallet: ${address.toLowerCase()}`,
    "Network: Base (8453)",
    `Calls: ${callsHash}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "This signature requests gas sponsorship for the listed calls. It does not submit a blockchain transaction.",
  ].join("\n");
}

async function consumeTicketRateLimit(env, address, clientIp) {
  const bucket = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1_000));
  const key = `rate:${await hashKey(`${address.toLowerCase()}:${clientIp}:${bucket}`)}`;
  const current = Number(await env.PAYMASTER_STATE.get(key) || "0");
  if (current >= MAX_TICKETS_PER_WINDOW) return false;
  await env.PAYMASTER_STATE.put(key, String(current + 1), { expirationTtl: RATE_WINDOW_SECONDS * 2 });
  return true;
}

async function createChallenge(request, env, address, callsHash) {
  const origin = requestOrigin(request);
  if (!/^0x[0-9a-fA-F]{64}$/.test(callsHash)) return json({ error: "Calls hash is invalid." }, 400, origin);
  const nonce = randomHex();
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1_000;
  const message = buildSponsorshipMessage({ origin, address, callsHash: callsHash.toLowerCase(), nonce, expiresAt });
  await env.PAYMASTER_STATE.put(
    `challenge:${nonce}`,
    JSON.stringify({ address: address.toLowerCase(), callsHash: callsHash.toLowerCase(), origin, expiresAt, message }),
    { expirationTtl: CHALLENGE_TTL_SECONDS },
  );
  return json({ nonce, message, expiresAt }, 200, origin);
}

async function createTicket(request, env, body) {
  const origin = requestOrigin(request);
  if (!hasSameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403, origin);
  if (!configured(env)) return json({ error: "Gas sponsorship is not configured." }, 503, origin);
  if (Number(request.headers.get("Content-Length") || "0") > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413, origin);
  if (!validAddress(body.address) || typeof body.signature !== "string" || typeof body.message !== "string" || typeof body.nonce !== "string") {
    return json({ error: "Wallet authentication is incomplete." }, 400, origin);
  }
  let validated;
  let callsHash;
  try {
    validated = validateSponsoredCalls(body.calls, body.address);
    callsHash = sponsoredCallsHash(validated.calls);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Calls are outside the sponsorship policy." }, 400, origin);
  }
  const challengeKey = `challenge:${body.nonce}`;
  const storedRaw = await env.PAYMASTER_STATE.get(challengeKey);
  await env.PAYMASTER_STATE.delete(challengeKey);
  if (!storedRaw) return json({ error: "Sponsorship request expired. Start again." }, 401, origin);
  let stored;
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    return json({ error: "Sponsorship request is invalid. Start again." }, 401, origin);
  }
  if (
    stored.address !== body.address.toLowerCase()
    || stored.origin !== origin
    || stored.callsHash !== callsHash
    || stored.message !== body.message
    || stored.expiresAt < Date.now()
  ) return json({ error: "Sponsorship request does not match these calls." }, 401, origin);
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
  if (!(await consumeTicketRateLimit(env, body.address, clientIp))) {
    return json({ error: "Gas sponsorship limit reached. Use the normal wallet path or try later." }, 429, origin);
  }
  const ticket = randomHex(32);
  const expiresAt = Date.now() + TICKET_TTL_SECONDS * 1_000;
  await env.PAYMASTER_STATE.put(
    `ticket:${ticket}`,
    JSON.stringify({
      address: body.address.toLowerCase(),
      callsHash,
      kind: validated.kind,
      expiresAt,
      fingerprint: null,
    }),
    { expirationTtl: TICKET_TTL_SECONDS },
  );
  return json({ ticket, expiresAt }, 200, origin);
}

export function implementationFromAccountState(code, implementationSlot) {
  const normalizedCode = String(code || "").toLowerCase();
  if (/^0xef0100[0-9a-f]{40}$/.test(normalizedCode)) return `0x${normalizedCode.slice(8)}`;
  const normalizedSlot = String(implementationSlot || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalizedSlot)) return null;
  const implementation = `0x${normalizedSlot.slice(-40)}`;
  return /^0x0{40}$/.test(implementation) ? null : implementation;
}

async function isSupportedBaseAccount(env, userOperation) {
  if (userOperation.initCode && userOperation.initCode !== "0x") return false;
  const client = createPublicClient({ transport: http(env.BASE_RPC_URL) });
  const [chainId, code, slot, implementationCode] = await Promise.all([
    client.getChainId(),
    client.getBytecode({ address: userOperation.sender }),
    client.getStorageAt({ address: userOperation.sender, slot: ERC1967_IMPLEMENTATION_SLOT }),
    client.getBytecode({ address: BASE_ACCOUNT_IMPLEMENTATION }),
  ]);
  const actualImplementation = implementationFromAccountState(code, slot);
  return chainId === 8453
    && !!implementationCode
    && implementationCode !== "0x"
    && keccak256(implementationCode).toLowerCase() === BASE_ACCOUNT_IMPLEMENTATION_CODE_HASH
    && !!actualImplementation
    && actualImplementation.toLowerCase() === BASE_ACCOUNT_IMPLEMENTATION;
}

function validRpcEnvelope(body) {
  return body
    && !Array.isArray(body)
    && body.jsonrpc === "2.0"
    && (typeof body.id === "string" || typeof body.id === "number")
    && PAYMASTER_METHODS.has(body.method)
    && Array.isArray(body.params)
    && body.params.length === 4;
}

async function proxyPaymaster(request, env, body) {
  if (!configured(env)) return rpcError(body?.id, -32000, "Gas sponsorship is unavailable.", 503);
  if (!validRpcEnvelope(body)) return rpcError(body?.id, -32600, "Invalid paymaster request.");
  const [userOperation, entryPoint, chainId, context] = body.params;
  if (
    !userOperation
    || !validAddress(userOperation.sender)
    || typeof userOperation.callData !== "string"
    || String(entryPoint).toLowerCase() !== ENTRY_POINT_V06
    || (String(chainId).toLowerCase() !== BASE_CHAIN_ID_HEX && String(chainId) !== "8453")
  ) return rpcError(body.id, -32602, "Only authenticated Base v0.6 operations are supported.");
  const ticketId = context?.naraTicket;
  if (typeof ticketId !== "string" || !/^[0-9a-f]{64}$/.test(ticketId)) {
    return rpcError(body.id, -32001, "A valid NARA sponsorship ticket is required.", 401);
  }
  const ticketKey = `ticket:${ticketId}`;
  const ticketRaw = await env.PAYMASTER_STATE.get(ticketKey);
  if (!ticketRaw) return rpcError(body.id, -32001, "Sponsorship ticket expired.", 401);
  let ticket;
  try {
    ticket = JSON.parse(ticketRaw);
  } catch {
    return rpcError(body.id, -32001, "Sponsorship ticket is invalid.", 401);
  }
  if (ticket.expiresAt < Date.now() || ticket.address !== userOperation.sender.toLowerCase()) {
    return rpcError(body.id, -32001, "Sponsorship ticket does not match this wallet.", 401);
  }
  let calls;
  let fingerprint;
  try {
    calls = decodeUserOperationCalls(userOperation.callData);
    validateSponsoredCalls(calls, userOperation.sender);
    if (sponsoredCallsHash(calls) !== ticket.callsHash) throw new Error("Calls changed after wallet authentication.");
    fingerprint = userOperationFingerprint(userOperation);
    if (ticket.fingerprint && ticket.fingerprint !== fingerprint) throw new Error("Sponsorship ticket was already bound to another operation.");
  } catch (error) {
    return rpcError(body.id, -32002, error instanceof Error ? error.message : "Operation is outside the NARA sponsorship policy.", 403);
  }
  if (!ticket.fingerprint) {
    ticket.fingerprint = fingerprint;
    await env.PAYMASTER_STATE.put(ticketKey, JSON.stringify(ticket), {
      expirationTtl: Math.max(60, Math.ceil((ticket.expiresAt - Date.now()) / 1_000)),
    });
  }
  const supportedAccount = await isSupportedBaseAccount(env, userOperation).catch(() => false);
  if (!supportedAccount) {
    return rpcError(body.id, -32002, "This wallet account implementation is not eligible for NARA sponsorship. Use the normal wallet path.", 403);
  }
  const upstreamContext = { ...context };
  delete upstreamContext.naraTicket;
  if (env.CDP_PAYMASTER_POLICY_ID) upstreamContext.policyId = env.CDP_PAYMASTER_POLICY_ID;
  const upstreamBody = {
    ...body,
    params: [userOperation, entryPoint, BASE_CHAIN_ID_HEX, upstreamContext],
  };
  let upstream;
  try {
    upstream = await fetch(env.CDP_PAYMASTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
    });
  } catch {
    return rpcError(body.id, -32003, "Gas sponsor could not be reached.", 502);
  }
  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  }
  if (request.method === "GET") {
    if (!hasSameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403, origin);
    if (!configured(env)) return json({ available: false }, 200, origin);
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    const callsHash = url.searchParams.get("callsHash");
    if (!address && !callsHash) return json({ available: true }, 200, origin);
    if (!validAddress(address) || !callsHash) return json({ error: "Wallet or calls hash is invalid." }, 400, origin);
    return createChallenge(request, env, address, callsHash);
  }
  if (request.method === "POST") {
    if (Number(request.headers.get("Content-Length") || "0") > MAX_BODY_BYTES) return rpcError(null, -32600, "Request is too large.", 413);
    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return rpcError(null, -32600, "Request is too large.", 413);
      }
      body = JSON.parse(raw);
    } catch {
      return rpcError(null, -32700, "Request body must be JSON.");
    }
    if (body?.action === "ticket") return createTicket(request, env, body);
    return proxyPaymaster(request, env, body);
  }
  return json({ error: "Method not allowed." }, 405, origin);
}
