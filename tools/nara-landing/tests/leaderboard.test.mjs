import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestHead, onRequestPost, onRequestOptions } from "../functions/api/leaderboard.js";

const ORIGIN = "https://naraprotocol.com";

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

function makeContext({ method = "GET", body, rawBody, headers = {}, env = {}, ip = "203.0.113.7" } = {}) {
  const h = new Headers({ "CF-Connecting-IP": ip, ...headers });
  const request = new Request(`${ORIGIN}/api/leaderboard`, {
    method,
    headers: h,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, env };
}

function withTurnstile(result) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
    return new Response(JSON.stringify(result), { status: 200 });
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
  const restore = withTurnstile({ success: true, hostname: "naraprotocol.com" });
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
