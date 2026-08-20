import { validateSponsoredCalls } from "./_shared/nara-paymaster-policy.js";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_BATCH_LENGTH = 25;

// The browser console only needs public reads. Transaction submission remains
// between the connected wallet and the wallet's own Base RPC provider.
const ALLOWED_RPC_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_simulateV1",
  "net_version",
]);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function validAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function validateSponsoredSimulation(call) {
  if (call.method !== "eth_simulateV1") return true;
  const [options, block] = Array.isArray(call.params) ? call.params : [];
  const blockStateCalls = options?.blockStateCalls;
  if (
    (block !== "latest" && block !== "safe")
    || !Array.isArray(blockStateCalls)
    || blockStateCalls.length !== 1
    || blockStateCalls[0]?.blockOverrides
    || blockStateCalls[0]?.stateOverrides
    || !Array.isArray(blockStateCalls[0]?.calls)
  ) return false;
  const simulationCalls = blockStateCalls[0].calls;
  if (simulationCalls.length < 2 || simulationCalls.length > 4) return false;
  const sentinel = simulationCalls.at(-1);
  if (String(sentinel?.to).toLowerCase() !== ZERO_ADDRESS) return false;
  const directCalls = simulationCalls.slice(0, -1);
  const sender = directCalls[0]?.from;
  if (!validAddress(sender) || directCalls.some((item) => String(item.from).toLowerCase() !== sender.toLowerCase())) return false;
  try {
    validateSponsoredCalls(directCalls.map((item) => ({
      to: item.to,
      data: item.data || "0x",
      value: item.value || "0x0",
    })), sender);
    return true;
  } catch {
    return false;
  }
}

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function rpcError(status, code, message, id = null, headers = {}) {
  return jsonResponse(status, {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  }, headers);
}

function getRpcCalls(payload) {
  if (Array.isArray(payload)) {
    if (payload.length === 0 || payload.length > MAX_BATCH_LENGTH) return null;
    return payload;
  }
  return [payload];
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return rpcError(405, -32600, "Only JSON-RPC POST requests are accepted.", null, {
      allow: "POST",
    });
  }

  const requestUrl = new URL(request.url);
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== requestUrl.origin) {
    return rpcError(403, -32600, "Only same-origin browser RPC requests are accepted.");
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return rpcError(413, -32600, "RPC request is too large.");
  }

  const requestBody = await request.text();
  if (new TextEncoder().encode(requestBody).byteLength > MAX_REQUEST_BYTES) {
    return rpcError(413, -32600, "RPC request is too large.");
  }

  let payload;
  try {
    payload = JSON.parse(requestBody);
  } catch {
    return rpcError(400, -32700, "Invalid JSON-RPC payload.");
  }

  const calls = getRpcCalls(payload);
  if (!calls || calls.some((call) => !call || typeof call !== "object" || typeof call.method !== "string")) {
    return rpcError(400, -32600, "Invalid JSON-RPC request.");
  }

  const blockedCall = calls.find((call) => !ALLOWED_RPC_METHODS.has(call.method));
  if (blockedCall) {
    return rpcError(
      403,
      -32601,
      "This preview endpoint permits read-only RPC methods only.",
      blockedCall.id ?? null,
    );
  }

  const invalidSimulation = calls.find((call) => !validateSponsoredSimulation(call));
  if (invalidSimulation) {
    return rpcError(
      403,
      -32602,
      "Simulation is limited to complete, policy-validated NARA actions.",
      invalidSimulation.id ?? null,
    );
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(env.BASE_RPC_URL);
    if (upstreamUrl.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return rpcError(503, -32000, "The preview RPC service is not configured.");
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "cache-control": "no-store",
        "content-type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return rpcError(502, -32000, "The Base RPC provider did not respond.");
  }
}
