import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestHead, onRequestPost, onRequestOptions } from "../functions/api/leaderboard.js";

const ORIGIN = "https://naraprotocol.io";

function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, type) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key, value) { store.set(key, value); },
  };
}

function makeContext({ method = "GET", url = `${ORIGIN}/api/leaderboard`, body, rawBody, headers = {}, env = {}, ip = "203.0.113.7" } = {}) {
  const h = new Headers({ "CF-Connecting-IP": ip, ...headers });
  const request = new Request(url, {
    method,
    headers: h,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, env };
}

function withTurnstile(result) {
  const original = globalThis.fetch;
  const payload = result && result.success === true
    ? { hostname: "naraprotocol.io", action: "fame_board_submit", ...result }
    : result;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  return () => { globalThis.fetch = original; };
}

const GOOD = { handle: "@toad_01", score: 40, cards: 12, turnstileToken: "tok" };
const GOOD_HEADERS = { Origin: ORIGIN, "Content-Type": "application/json" };

test("GET returns [] when KV empty and never sets CORS *", async () => {
  const res = await onRequestGet(makeContext({ env: { NARA_LEADERBOARD_KV: makeKV() } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("GET filters legacy seeds and malformed rows and re-types every field", async () => {
  const kv = makeKV({ fame_board_v1: JSON.stringify([
    { handle: "@Satoshi_Plunger", score: 12 },
    { handle: 42, score: 12 },
    { handle: "@real", score: "nope" },
    { handle: "@real", score: 20, tier: "<b>x</b>", date: ["<img src=x onerror=alert(1)>"], timestamp: "1" },
    { handle: "@other<svg>", score: 30, date: "Nov 2, 2026", timestamp: 2 },
  ]) });
  const res = await onRequestGet(makeContext({ env: { NARA_LEADERBOARD_KV: kv } }));
  const data = await res.json();
  assert.equal(data.length, 2);
  assert.equal(data[0].handle, "@real");
  assert.equal(data[0].rank, 1);
  assert.equal(data[0].tier, "GOD-TIER PORCELAIN DEITY", "tier is recomputed, stored value ignored");
  assert.equal(data[0].date, "", "non-string date dropped");
  assert.equal(data[1].handle, "@othersvg", "handle re-normalized");
  assert.equal(res.headers.get("Content-Security-Policy"), "default-src 'none'; frame-ancestors 'none'");
});

test("HEAD mirrors GET headers with no body", async () => {
  const res = await onRequestHead(makeContext({ method: "HEAD", env: { NARA_LEADERBOARD_KV: makeKV() } }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
  assert.match(res.headers.get("Cache-Control"), /max-age=15/);
});

test("OPTIONS is 405 (no CORS preflight support)", async () => {
  const res = await onRequestOptions(makeContext({ method: "OPTIONS" }));
  assert.equal(res.status, 405);
});

test("POST without Origin is 403 and stores nothing", async () => {
  const kv = makeKV();
  const res = await onRequestPost(makeContext({
    method: "POST", body: GOOD, headers: { "Content-Type": "application/json" },
    env: { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "s" },
  }));
  assert.equal(res.status, 403);
  assert.equal(kv.store.size, 0);
});

test("POST with foreign Origin is 403", async () => {
  const res = await onRequestPost(makeContext({
    method: "POST", body: GOOD, headers: { ...GOOD_HEADERS, Origin: "https://evil.example" },
    env: { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" },
  }));
  assert.equal(res.status, 403);
});

test("POST is 503 board_disabled when TURNSTILE_SECRET_KEY missing", async () => {
  const res = await onRequestPost(makeContext({
    method: "POST", body: GOOD, headers: GOOD_HEADERS, env: { NARA_LEADERBOARD_KV: makeKV() },
  }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "board_disabled");
});

test("POST with non-JSON content type is 415", async () => {
  const res = await onRequestPost(makeContext({
    method: "POST", body: GOOD, headers: { Origin: ORIGIN, "Content-Type": "text/plain" },
    env: { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" },
  }));
  assert.equal(res.status, 415);
});

test("POST with failed Turnstile is 403", async () => {
  const restore = withTurnstile({ success: false, "error-codes": ["invalid-input-response"] });
  try {
    const res = await onRequestPost(makeContext({
      method: "POST", body: GOOD, headers: GOOD_HEADERS,
      env: { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" },
    }));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "verification_failed");
  } finally { restore(); }
});

test("POST with missing token never calls siteverify and is 403", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("{}"); };
  try {
    const res = await onRequestPost(makeContext({
      method: "POST", body: { ...GOOD, turnstileToken: undefined }, headers: GOOD_HEADERS,
      env: { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" },
    }));
    assert.equal(res.status, 403);
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});

test("POST happy path stores, ranks, returns board; repeat only improves", async () => {
  const restore = withTurnstile({ success: true, hostname: "naraprotocol.io" });
  try {
    const kv = makeKV();
    const env = { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "s" };
    let res = await onRequestPost(makeContext({ method: "POST", body: GOOD, headers: GOOD_HEADERS, env }));
    assert.equal(res.status, 200);
    let data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.stored, true);
    assert.equal(data.board.length, 1);
    assert.equal(data.board[0].handle, "@toad_01");
    assert.equal(data.board[0].rank, 1);
    assert.equal(data.board[0].tier, "ELITE SEWER TACTICIAN");

    res = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, score: 60 }, headers: GOOD_HEADERS, env, ip: "203.0.113.8" }));
    data = await res.json();
    assert.equal(data.board.length, 1);
    assert.equal(data.board[0].score, 40, "worse score must not replace better one");

    res = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, handle: "@TOAD_01", score: 20 }, headers: GOOD_HEADERS, env, ip: "203.0.113.9" }));
    data = await res.json();
    assert.equal(data.board.length, 1, "handle match is case-insensitive");
    assert.equal(data.board[0].score, 20);
    assert.equal(data.board[0].tier, "GOD-TIER PORCELAIN DEITY");
  } finally { restore(); }
});

test("POST rejects bad score, bad cards, bad handle; oversized body is 413", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const env = { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" };
    let i = 10;
    for (const body of [
      { ...GOOD, score: 11 }, { ...GOOD, score: 50001 }, { ...GOOD, score: "x" }, { ...GOOD, score: 40.5 },
      { ...GOOD, cards: 11 }, { ...GOOD, cards: "12" }, { ...GOOD, handle: "@" }, { ...GOOD, handle: "<>!!" }, { ...GOOD, handle: 7 },
    ]) {
      const res = await onRequestPost(makeContext({ method: "POST", body, headers: GOOD_HEADERS, env, ip: `203.0.113.${i++}` }));
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const big = { ...GOOD, pad: "x".repeat(5000) };
    const res = await onRequestPost(makeContext({ method: "POST", body: big, headers: GOOD_HEADERS, env, ip: "203.0.113.99" }));
    assert.equal(res.status, 413);
    const bad = await onRequestPost(makeContext({ method: "POST", rawBody: "{not json", headers: GOOD_HEADERS, env, ip: "203.0.113.98" }));
    assert.equal(bad.status, 400);
  } finally { restore(); }
});

test("POST rate limits the 6th submission from one IP within the window", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const env = { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" };
    let last;
    for (let i = 0; i < 6; i++) {
      last = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, handle: `@op_${i}` }, headers: GOOD_HEADERS, env }));
    }
    assert.equal(last.status, 429);
    assert.equal(last.headers.get("Retry-After"), "3600");
  } finally { restore(); }
});

test("failed verification and invalid payloads do not consume rate budget", async () => {
  const kv = makeKV();
  const env = { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "s" };
  let restore = withTurnstile({ success: false });
  try {
    for (let i = 0; i < 6; i++) {
      const res = await onRequestPost(makeContext({ method: "POST", body: GOOD, headers: GOOD_HEADERS, env }));
      assert.equal(res.status, 403);
    }
    for (let i = 0; i < 6; i++) {
      const res = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, score: 1 }, headers: GOOD_HEADERS, env }));
      assert.equal(res.status, 400);
    }
  } finally { restore(); }
  restore = withTurnstile({ success: true });
  try {
    const res = await onRequestPost(makeContext({ method: "POST", body: GOOD, headers: GOOD_HEADERS, env }));
    assert.equal(res.status, 200, "a valid submission after 12 failures still succeeds");
    assert.equal(kv.store.get("rl:203.0.113.7"), "1");
  } finally { restore(); }
});

test("handle is normalized to one leading @, allowed chars, max 20 after @", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const env = { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" };
    const res = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, handle: "@@Toad Bob!!_12345678901234567890" }, headers: GOOD_HEADERS, env }));
    const data = await res.json();
    assert.equal(data.board[0].handle, "@ToadBob_123456789012");
    assert.equal(data.board[0].handle.length, 21);
    const res2 = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, handle: "<script>alert(1)</script>", score: 13 }, headers: GOOD_HEADERS, env, ip: "203.0.113.50" }));
    const data2 = await res2.json();
    assert.equal(data2.board[0].handle, "@scriptalert1script", "markup is stripped, never stored");
  } finally { restore(); }
});

test("board is capped at 50 ranked entries", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const seed = Array.from({ length: 50 }, (_, i) => ({ handle: `@seed_${i}`, score: 100 + i, tier: "PERSISTENT BEAR SLAYER", date: "d", timestamp: i }));
    const kv = makeKV({ fame_board_v1: JSON.stringify(seed) });
    const env = { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "s" };
    const res = await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, score: 12 }, headers: GOOD_HEADERS, env }));
    const data = await res.json();
    assert.equal(data.board.length, 50);
    assert.equal(data.board[0].handle, "@toad_01");
    assert.equal(data.board[49].rank, 50);
    assert.equal(data.board.some((e) => e.handle === "@seed_49"), false, "worst entry drops off");
  } finally { restore(); }
});

test("POST rejects legacy mock seed handles with 400", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const env = { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" };
    const res = await onRequestPost(makeContext({
      method: "POST",
      body: { ...GOOD, handle: "@Satoshi_Plunger" },
      headers: GOOD_HEADERS,
      env,
    }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_handle");
  } finally { restore(); }
});

test("POST rate limits IPv6 addresses across the same /64 prefix", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const env = { NARA_LEADERBOARD_KV: makeKV(), TURNSTILE_SECRET_KEY: "s" };
    let last;
    for (let i = 0; i < 6; i++) {
      last = await onRequestPost(makeContext({
        method: "POST",
        body: { ...GOOD, handle: `@v6_${i}` },
        headers: GOOD_HEADERS,
        env,
        ip: `2001:db8:abcd:0012::${i + 1}`,
      }));
    }
    assert.equal(last.status, 429, "different host suffixes in same /64 share rate-limit bucket");
  } finally { restore(); }
});

test("POST skips KV board write when submitted score does not improve existing record", async () => {
  const restore = withTurnstile({ success: true });
  try {
    let boardPuts = 0;
    const kv = makeKV();
    const origPut = kv.put.bind(kv);
    kv.put = async (key, value, opts) => {
      if (key === "fame_board_v1") boardPuts++;
      return origPut(key, value, opts);
    };
    const env = { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "s" };
    await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, score: 25 }, headers: GOOD_HEADERS, env, ip: "203.0.113.70" }));
    assert.equal(boardPuts, 1);
    await onRequestPost(makeContext({ method: "POST", body: { ...GOOD, score: 40 }, headers: GOOD_HEADERS, env, ip: "203.0.113.71" }));
    assert.equal(boardPuts, 1, "worse score must not trigger a KV board write");
  } finally { restore(); }
});

test("IPv4-mapped IPv6 addresses map to distinct IPv4 buckets instead of sharing ::/64", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const kv = makeKV();
    const env = { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "s" };
    // Exhaust bucket for ::ffff:203.0.113.5
    for (let i = 0; i < 5; i++) {
      const r = await onRequestPost(makeContext({
        method: "POST",
        body: { ...GOOD, handle: `@m1_${i}` },
        headers: GOOD_HEADERS,
        env,
        ip: "::ffff:203.0.113.5",
      }));
      assert.equal(r.status, 200);
    }
    // Plain IPv4 203.0.113.5 shares the exact same bucket and is rate-limited on #6
    const blocked = await onRequestPost(makeContext({
      method: "POST",
      body: { ...GOOD, handle: "@m1_block" },
      headers: GOOD_HEADERS,
      env,
      ip: "203.0.113.5",
    }));
    assert.equal(blocked.status, 429);

    // Different IPv4-mapped IPv6 (::ffff:198.51.100.9) is NOT blocked by 203.0.113.5
    const independent = await onRequestPost(makeContext({
      method: "POST",
      body: { ...GOOD, handle: "@m2_ok" },
      headers: GOOD_HEADERS,
      env,
      ip: "0:0:0:0:0:ffff:198.51.100.9",
    }));
    assert.equal(independent.status, 200);
  } finally { restore(); }
});

test("POST stores masked walletHint, validated postUrl, platform, and returns verifiable NARA Claim Pass", async () => {
  const restore = withTurnstile({ success: true });
  try {
    const kv = makeKV();
    const env = {
      NARA_LEADERBOARD_KV: kv,
      TURNSTILE_SECRET_KEY: "s",
      AWARD_CLAIM_SALT: "test_salt_123",
      AWARD_ADMIN_TOKEN: "admin_secret_token_1234567",
    };

    // Invalid wallet rejected with 400
    const badWalletRes = await onRequestPost(makeContext({
      method: "POST",
      body: { ...GOOD, wallet: "not-a-wallet" },
      headers: GOOD_HEADERS,
      env,
    }));
    assert.equal(badWalletRes.status, 400);
    assert.equal((await badWalletRes.json()).error, "invalid_wallet");

    // Valid post with platform, wallet, postUrl, operatorKey
    const wallet = "0x1111111111111111111111111111111111111111";
    const postUrl = "https://x.com/nara/status/123456";
    const okRes = await onRequestPost(makeContext({
      method: "POST",
      body: { ...GOOD, platform: "tg", wallet, postUrl, operatorKey: "op_key_abc_1_valid16" },
      headers: GOOD_HEADERS,
      env,
    }));
    assert.equal(okRes.status, 200);
    const okBody = await okRes.json();
    assert.match(okBody.claimCode, /^NARA-[A-F0-9]{4}-[A-F0-9]{4}$/);
    const postedRow = okBody.board[0];
    assert.equal(postedRow.platform, "tg");
    assert.equal(postedRow.walletHint, "0x1111…1111");
    assert.equal(postedRow.postUrl, postUrl);
    assert.equal(postedRow.awardReady, true);
    assert.equal("wallet" in postedRow, false, "public POST entry must not expose raw wallet");

    // Public GET must mask wallet and omit operator keyHash
    const pubGet = await onRequestGet(makeContext({ env }));
    const pubRows = await pubGet.json();
    assert.equal(pubRows.length, 1);
    assert.equal(pubRows[0].walletHint, "0x1111…1111");
    assert.equal("wallet" in pubRows[0], false);
    assert.equal("keyHash" in pubRows[0], false);

    // Public GET ?verify=1 validates real Claim Code and rejects forged codes
    const verifyOk = await onRequestGet(makeContext({
      url: `${ORIGIN}/api/leaderboard?verify=1&handle=%40toad_01&claim=${okBody.claimCode}`,
      env,
    }));
    assert.equal(verifyOk.status, 200);
    assert.equal((await verifyOk.json()).valid, true);

    const verifyBad = await onRequestGet(makeContext({
      url: `${ORIGIN}/api/leaderboard?verify=1&handle=%40toad_01&claim=NARA-0000-0000`,
      env,
    }));
    assert.equal((await verifyBad.json()).valid, false);

    // Anti-hijack: different operatorKey cannot overwrite @toad_01
    const hijackRes = await onRequestPost(makeContext({
      method: "POST",
      body: { ...GOOD, score: 15, operatorKey: "different_attacker_key_99" },
      headers: GOOD_HEADERS,
      env,
      ip: "203.0.113.9",
    }));
    assert.equal(hijackRes.status, 403);
    assert.equal((await hijackRes.json()).error, "handle_locked");

    // Admin GET ?admin=1 requires bearer token and reveals unmasked payout list when authorized
    const adminNoAuth = await onRequestGet(makeContext({
      url: `${ORIGIN}/api/leaderboard?admin=1`,
      env,
    }));
    assert.equal(adminNoAuth.status, 403);

    const adminOk = await onRequestGet(makeContext({
      url: `${ORIGIN}/api/leaderboard?admin=1`,
      headers: { Authorization: "Bearer admin_secret_token_1234567" },
      env,
    }));
    assert.equal(adminOk.status, 200);
    const adminBody = await adminOk.json();
    assert.equal(adminBody.count, 1);
    assert.equal(adminBody.entries[0].wallet, wallet);
    assert.equal(adminBody.entries[0].hasClaimPass, true);
  } finally { restore(); }
});

test("Turnstile rejects spoofed hostname (localhost / evil.example) and wrong action on real secret", async () => {
  const kv = makeKV();
  const env = { NARA_LEADERBOARD_KV: kv, TURNSTILE_SECRET_KEY: "real-prod-secret" };

  for (const badSiteverify of [
    { success: true, hostname: "localhost", action: "fame_board_submit" },
    { success: true, hostname: "evil.example", action: "fame_board_submit" },
    { success: true, hostname: "naraprotocol.io", action: "wrong_action" },
  ]) {
    const restore = withTurnstile(badSiteverify);
    try {
      const res = await onRequestPost(makeContext({
        method: "POST",
        body: GOOD,
        headers: GOOD_HEADERS,
        env,
      }));
      assert.equal(res.status, 403);
      assert.equal((await res.json()).error, "verification_failed");
    } finally { restore(); }
  }

  // Preview Pages host matches preview Turnstile hostname
  const restorePreview = withTurnstile({
    success: true,
    hostname: "preview.nara-landing-6wd.pages.dev",
    action: "fame_board_submit",
  });
  try {
    const previewOrigin = "https://preview.nara-landing-6wd.pages.dev";
    const okPreview = await onRequestPost(makeContext({
      method: "POST",
      url: `${previewOrigin}/api/leaderboard`,
      body: GOOD,
      headers: { Origin: previewOrigin, "Content-Type": "application/json" },
      env,
    }));
    assert.equal(okPreview.status, 200);
    assert.equal(okPreview.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(okPreview.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  } finally { restorePreview(); }
});

test("GET ?admin=1 enforces >=24-char token and rate limits brute force at 429; GET ?verify=1 rate limits at 429", async () => {
  const kv = makeKV();
  const shortRes = await onRequestGet(makeContext({
    url: `${ORIGIN}/api/leaderboard?admin=1`,
    headers: { Authorization: "Bearer short_16_chars_only" },
    env: { NARA_LEADERBOARD_KV: kv, AWARD_ADMIN_TOKEN: "short_16_chars_only" },
  }));
  assert.equal(shortRes.status, 503);
  assert.equal((await shortRes.json()).error, "admin_disabled");

  const env = { NARA_LEADERBOARD_KV: kv, AWARD_ADMIN_TOKEN: "valid_prod_admin_token_0123456789" };
  for (let i = 0; i < 5; i++) {
    const failRes = await onRequestGet(makeContext({
      url: `${ORIGIN}/api/leaderboard?admin=1`,
      headers: { Authorization: "Bearer wrong_guess" },
      env,
      ip: "198.51.100.77",
    }));
    assert.equal(failRes.status, 403);
  }
  const throttledAdmin = await onRequestGet(makeContext({
    url: `${ORIGIN}/api/leaderboard?admin=1`,
    headers: { Authorization: "Bearer wrong_guess" },
    env,
    ip: "198.51.100.77",
  }));
  assert.equal(throttledAdmin.status, 429);
  assert.equal((await throttledAdmin.json()).error, "rate_limited");

  for (let i = 0; i < 30; i++) {
    const missVerify = await onRequestGet(makeContext({
      url: `${ORIGIN}/api/leaderboard?verify=1&handle=%40missing&claim=NARA-0000-0000`,
      env,
      ip: "198.51.100.88",
    }));
    assert.equal(missVerify.status, 200);
    assert.equal((await missVerify.json()).valid, false);
  }
  const throttledVerify = await onRequestGet(makeContext({
    url: `${ORIGIN}/api/leaderboard?verify=1&handle=%40missing&claim=NARA-0000-0000`,
    env,
    ip: "198.51.100.88",
  }));
  assert.equal(throttledVerify.status, 429);
  assert.equal((await throttledVerify.json()).error, "rate_limited");
});
