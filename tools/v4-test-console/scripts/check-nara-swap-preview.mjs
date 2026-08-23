import assert from "node:assert/strict";

const previewUrl = process.argv[2] || "https://nara-swap-preview.pages.dev";
const origin = new URL(previewUrl).origin;
const pageUrl = new URL("/", previewUrl);
const rpcUrl = new URL("/base-rpc", previewUrl);

const page = await fetch(pageUrl, { redirect: "follow" });
assert.equal(page.status, 200, "swap preview must return HTTP 200");
const html = await page.text();
assert.match(html, /<title>NARA Swap<\/title>/, "swap preview title is missing");
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.equal(page.headers.get("x-frame-options"), "DENY");
assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");

async function rpc(payload, requestOrigin = origin) {
  return fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
    },
    body: JSON.stringify(payload),
  });
}

const chainResponse = await rpc({
  jsonrpc: "2.0",
  id: 1,
  method: "eth_chainId",
  params: [],
});
assert.equal(chainResponse.status, 200);
assert.equal((await chainResponse.json()).result, "0x2105", "RPC must be bound to Base");

const blockedBroadcast = await rpc({
  jsonrpc: "2.0",
  id: 2,
  method: "eth_sendRawTransaction",
  params: ["0xdeadbeef"],
});
assert.equal(blockedBroadcast.status, 403, "public proxy must reject transaction broadcasts");

const blockedOrigin = await rpc({
  jsonrpc: "2.0",
  id: 3,
  method: "eth_chainId",
  params: [],
}, "https://untrusted.invalid");
assert.equal(blockedOrigin.status, 403, "public proxy must reject cross-origin calls");

console.log(JSON.stringify({
  preview: pageUrl.href,
  pageStatus: page.status,
  chainId: 8453,
  transactionBroadcast: "blocked",
  crossOriginRpc: "blocked",
  securityHeaders: "verified",
}, null, 2));
