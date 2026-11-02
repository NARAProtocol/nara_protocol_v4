// Cloudflare Pages Function: /api/leaderboard
// All-Time Fame Board: fewest flushes to complete 12/12 sticker cards.
// Scores are SELF-REPORTED by the browser. This endpoint limits abuse; it cannot prove play.
//
// Bindings (Pages project settings, not in code):
//   NARA_LEADERBOARD_KV   KV namespace (board + rate-limit counters)
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret. Missing => POST returns 503 board_disabled.

const BOARD_KEY = "fame_board_v1";
const MAX_ENTRIES = 50;
const MAX_BODY_BYTES = 2048;
const RATE_LIMIT_MAX = 5;           // submissions per IP per window
const RATE_LIMIT_WINDOW_SEC = 3600; // KV minimum TTL is 60s; one hour keeps churn low
const LEGACY_SEEDS = new Set(["@satoshi_plunger", "@vitalik_roll", "@base_general", "@degen_harvester", "@sewer_sniper"]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function getKV(env) {
  return env?.NARA_LEADERBOARD_KV || env?.KV || null;
}

function cleanBoard(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) =>
    item
    && typeof item.handle === "string"
    && !LEGACY_SEEDS.has(item.handle.trim().toLowerCase())
    && Number.isFinite(Number(item.score)));
}

// One leading "@", then [A-Za-z0-9_.-], max 20 chars after the "@".
function normalizeHandle(raw) {
  if (typeof raw !== "string") return "";
  const body = raw.trim().replace(/@/g, "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 20);
  return body.length >= 1 ? `@${body}` : "";
}

function tierFor(score) {
  if (score < 35) return "GOD-TIER PORCELAIN DEITY";
  if (score < 50) return "ELITE SEWER TACTICIAN";
  if (score < 70) return "CERTIFIED PURGER";
  return "PERSISTENT BEAR SLAYER";
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function verifyTurnstile(secret, token, ip) {
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data && data.success === true;
  } catch {
    return false;
  }
}

// KV is eventually consistent, so this is an abuse brake, not an exact counter.
async function rateLimited(kv, ip) {
  if (!kv || !ip) return false;
  const key = `rl:${ip}`;
  const current = Number(await kv.get(key)) || 0;
  if (current >= RATE_LIMIT_MAX) return true;
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  return false;
}

export async function onRequestOptions() {
  return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
}

export async function onRequestGet(context) {
  const cache = { "Cache-Control": "public, max-age=15, s-maxage=30" };
  try {
    const kv = getKV(context.env);
    if (kv) {
      const stored = await kv.get(BOARD_KEY, "json");
      return json(cleanBoard(stored), 200, cache);
    }
  } catch (err) {
    console.warn("leaderboard GET error", err);
  }
  return json([], 200, cache);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!sameOrigin(request)) return json({ error: "forbidden_origin" }, 403);

    const secret = typeof env?.TURNSTILE_SECRET_KEY === "string" ? env.TURNSTILE_SECRET_KEY.trim() : "";
    if (!secret) return json({ error: "board_disabled" }, 503);

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_json" }, 400);

    const ip = request.headers.get("CF-Connecting-IP") || "";
    const kv = getKV(env);
    if (await rateLimited(kv, ip)) return json({ error: "rate_limited" }, 429, { "Retry-After": "600" });

    if (!(await verifyTurnstile(secret, body.turnstileToken, ip))) return json({ error: "verification_failed" }, 403);

    const handle = normalizeHandle(body.handle);
    // Only JSON integers are accepted; the client sends whole click counts.
    const score = body.score;
    const cards = body.cards;
    if (!handle || handle.length < 2) return json({ error: "invalid_handle" }, 400);
    if (!Number.isInteger(score) || score < 12 || score > 50000) return json({ error: "invalid_score" }, 400);
    if (cards !== 12) return json({ error: "collection_incomplete" }, 400);

    const entry = {
      handle,
      score,
      tier: tierFor(score),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timestamp: Date.now(),
    };

    if (!kv) return json({ ok: true, board: [{ ...entry, rank: 1 }], stored: false });

    let list = cleanBoard(await kv.get(BOARD_KEY, "json"));
    const idx = list.findIndex((e) => e.handle.toLowerCase() === handle.toLowerCase());
    if (idx !== -1) {
      if (score < Number(list[idx].score)) list[idx] = entry;
    } else {
      list.push(entry);
    }
    list.sort((a, b) => (a.score !== b.score ? a.score - b.score : (a.timestamp || 0) - (b.timestamp || 0)));
    list = list.slice(0, MAX_ENTRIES).map((item, i) => ({ ...item, rank: i + 1 }));
    await kv.put(BOARD_KEY, JSON.stringify(list));
    return json({ ok: true, board: list, stored: true });
  } catch (err) {
    console.warn("leaderboard POST error", err);
    return json({ error: "server_error" }, 500);
  }
}
