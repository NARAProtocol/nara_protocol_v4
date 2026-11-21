import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CRYPTOSLIP_COMMIT_URL,
  CRYPTOSLIP_TG_BUY_URL,
  CRYPTOSLIP_TG_COMMIT_URL,
  CRYPTOSLIP_URL,
  isTelegramWebView,
  resolveCryptoSlipBuyUrl,
  resolveCryptoSlipCommitUrl,
} from "../src/meme/config.js";
import { WEBAUTHN_ROR_PAYLOAD, handleWebauthnRequest } from "../functions/_shared/webauthnCore.js";
import { onRequest as onMiddlewareRequest } from "../functions/_middleware.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("handleWebauthnRequest and middleware serve 200 application/json for /.well-known/webauthn", async () => {
  const res = await onMiddlewareRequest({
    request: new Request("https://naraprotocol.io/.well-known/webauthn?cb=1", { method: "GET" }),
    next: async () => new Response("fallthrough", { status: 404 }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const json = await res.json();
  assert.deepEqual(json, WEBAUTHN_ROR_PAYLOAD);
  assert.deepEqual(json, { origins: ["https://cryptoslip.eth.limo"] });

  const headRes = handleWebauthnRequest(new Request("https://naraprotocol.io/.well-known/webauthn", { method: "HEAD" }));
  assert.equal(headRes.status, 200);
  assert.equal(headRes.headers.get("content-type"), "application/json; charset=utf-8");

  const otherRes = await onMiddlewareRequest({
    request: new Request("https://naraprotocol.io/api/supply", { method: "GET" }),
    next: async () => new Response("next-called", { status: 200 }),
  });
  assert.equal(await otherRes.text(), "next-called");
});

test("public/_routes.json scopes Functions to /api/* and /.well-known/webauthn", () => {
  const routesPath = path.join(ROOT, "public", "_routes.json");
  const routes = JSON.parse(fs.readFileSync(routesPath, "utf8"));
  assert.equal(routes.version, 1);
  assert.ok(Array.isArray(routes.include));
  assert.ok(routes.include.includes("/api/*"));
  assert.ok(routes.include.includes("/.well-known/webauthn"));

  const webauthnStatic = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public", ".well-known", "webauthn"), "utf8"),
  );
  assert.deepEqual(webauthnStatic, { origins: ["https://cryptoslip.eth.limo"] });

  const headersRaw = fs.readFileSync(path.join(ROOT, "public", "_headers"), "utf8");
  assert.match(headersRaw, /\/\.well-known\/webauthn/);
  assert.match(headersRaw, /Content-Type:\s*application\/json;\s*charset=utf-8/);
});

test("Telegram WebView routes CryptoSLIP links straight to @cryptoslip_bot/SLIP Mini App", () => {
  assert.equal(
    isTelegramWebView({}, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1" }),
    false,
  );
  assert.equal(resolveCryptoSlipBuyUrl({}, { userAgent: "Mozilla/5.0 Safari/604.1" }), CRYPTOSLIP_URL);
  assert.equal(resolveCryptoSlipCommitUrl({}, { userAgent: "Mozilla/5.0 Safari/604.1" }), CRYPTOSLIP_COMMIT_URL);

  assert.equal(isTelegramWebView({ TelegramWebviewProxy: {} }, { userAgent: "Mozilla/5.0" }), true);
  assert.equal(isTelegramWebView({}, { userAgent: "Mozilla/5.0 Telegram-iOS/11.4" }), true);
  assert.equal(isTelegramWebView({ Telegram: { WebApp: { initData: "user=123" } } }, { userAgent: "Mozilla/5.0" }), true);

  assert.equal(
    resolveCryptoSlipBuyUrl({ TelegramWebviewProxy: {} }, { userAgent: "Mozilla/5.0" }),
    CRYPTOSLIP_TG_BUY_URL,
  );
  assert.equal(
    resolveCryptoSlipCommitUrl({}, { userAgent: "Mozilla/5.0 Telegram-iOS/11.4" }),
    CRYPTOSLIP_TG_COMMIT_URL,
  );
});
