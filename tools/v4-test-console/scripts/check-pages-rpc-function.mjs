import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi } from "viem";
import { onRequest } from "../functions/base-rpc.js";
import { NARA_PAYMASTER_ADDRESSES } from "../functions/_shared/nara-paymaster-policy.js";

const endpoint = "https://nara-v4-console-preview.pages.dev/base-rpc";
const fakeUpstream = "https://rpc.invalid/private-path";

function makeRequest(method, payload, headers = {}) {
  return new Request(endpoint, {
    method,
    headers: {
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      origin: new URL(endpoint).origin,
      ...headers,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

const methodResponse = await onRequest({
  request: makeRequest("GET"),
  env: { BASE_RPC_URL: fakeUpstream },
});
assert.equal(methodResponse.status, 405);
assert.equal(methodResponse.headers.get("allow"), "POST");

const blockedResponse = await onRequest({
  request: makeRequest("POST", {
    jsonrpc: "2.0",
    id: 7,
    method: "eth_sendRawTransaction",
    params: ["0xdeadbeef"],
  }),
  env: { BASE_RPC_URL: fakeUpstream },
});
assert.equal(blockedResponse.status, 403);
assert.match((await blockedResponse.json()).error.message, /read-only/i);

const crossOriginResponse = await onRequest({
  request: makeRequest("POST", {
    jsonrpc: "2.0",
    id: 8,
    method: "eth_chainId",
    params: [],
  }, { origin: "https://untrusted.invalid" }),
  env: { BASE_RPC_URL: fakeUpstream },
});
assert.equal(crossOriginResponse.status, 403);

const invalidSimulationResponse = await onRequest({
  request: makeRequest("POST", {
    jsonrpc: "2.0",
    id: 10,
    method: "eth_simulateV1",
    params: [{ blockStateCalls: [{ calls: [] }] }, "latest"],
  }),
  env: { BASE_RPC_URL: fakeUpstream },
});
assert.equal(invalidSimulationResponse.status, 403);
assert.match((await invalidSimulationResponse.json()).error.message, /policy-validated NARA/i);

const originalFetch = globalThis.fetch;
let forwardedUrl;
let forwardedBody;
try {
  globalThis.fetch = async (url, init) => {
    forwardedUrl = String(url);
    forwardedBody = init.body;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 9, result: "0x2105" }), {
      headers: { "content-type": "application/json" },
    });
  };

  const allowedPayload = {
    jsonrpc: "2.0",
    id: 9,
    method: "eth_chainId",
    params: [],
  };
  const allowedResponse = await onRequest({
    request: makeRequest("POST", allowedPayload),
    env: { BASE_RPC_URL: fakeUpstream },
  });

  assert.equal(allowedResponse.status, 200);
  assert.equal(forwardedUrl, fakeUpstream);
  assert.deepEqual(JSON.parse(forwardedBody), allowedPayload);
  assert.equal((await allowedResponse.json()).result, "0x2105");

  const wallet = "0x0000000000000000000000000000000000001234";
  const amount = 10n * 10n ** 18n;
  const simulationPayload = {
    jsonrpc: "2.0",
    id: 11,
    method: "eth_simulateV1",
    params: [{
      blockStateCalls: [{
        calls: [
          {
            from: wallet,
            to: NARA_PAYMASTER_ADDRESSES.nara,
            data: encodeFunctionData({
              abi: parseAbi(["function approve(address spender,uint256 amount)"]),
              functionName: "approve",
              args: [NARA_PAYMASTER_ADDRESSES.engine, amount],
            }),
          },
          {
            from: wallet,
            to: NARA_PAYMASTER_ADDRESSES.engine,
            value: "0xe8d4a51000",
            data: encodeFunctionData({
              abi: parseAbi(["function lock(uint256 amount,uint64 durationEpochs,uint256 minWeight) payable"]),
              functionName: "lock",
              args: [amount, 9n, amount - amount / 200n],
            }),
          },
          { from: wallet, to: "0x0000000000000000000000000000000000000000" },
        ],
      }],
    }, "latest"],
  };
  const simulationResponse = await onRequest({
    request: makeRequest("POST", simulationPayload),
    env: { BASE_RPC_URL: fakeUpstream },
  });
  assert.equal(simulationResponse.status, 200);
  assert.deepEqual(JSON.parse(forwardedBody), simulationPayload);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Pages RPC proxy checks passed: read-only forwarding and request guards are active.");
