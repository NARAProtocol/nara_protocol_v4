// Cloudflare Pages Function: /api/leaderboard
// All-Time Fame Board: fewest flushes to complete 12/12 sticker cards.
// Scores are SELF-REPORTED by the browser. This endpoint limits abuse; it cannot prove play.
//
// Bindings (Pages project settings, not in code):
//   NARA_LEADERBOARD_KV   KV namespace (board + rate-limit counters)
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret. Missing => POST returns 503 board_disabled.
//
// Note: Pages `_headers` rules do not apply to Function responses, so every header this
// endpoint needs is set here.

const BOARD_KEY = "fame_board_v1";
const MAX_ENTRIES = 50;
const MAX_BODY_BYTES = 2048;
const RATE_LIMIT_MAX = 5;           // accepted submissions per IP per window
const RATE_LIMIT_WINDOW_SEC = 3600; // KV minimum TTL is 60s; one hour keeps churn low
const LEGACY_SEEDS = new Set(["@satoshi_plunger", "@vitalik_roll", "@base_general", "@degen_harvester", "@sewer_sniper"]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
const GET_CACHE = { "Cache-Control": "public, max-age=15, s-maxage=30" };

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function getKV(env) {
  return env?.NARA_LEADERBOARD_KV || env?.KV || null;
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

// Every stored row is re-validated and re-typed before it is served or merged, so hostile
// or malformed KV content never reaches a browser.
function cleanBoard(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof item.handle !== "string") continue;
    const handle = normalizeHandle(item.handle);
    if (!handle || LEGACY_SEEDS.has(handle.toLowerCase())) continue;
    const score = Number(item.score);
    if (!Number.isInteger(score) || score < 1 || score > 50000) continue;
    out.push({
      handle,
      score,
      tier: tierFor(score),
      date: typeof item.date === "string" ? item.date.slice(0, 24) : "",
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : 0,
    });
  }
  return out;
}

function rankBoard(list) {
  return [...list]
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : (a.timestamp || 0) - (b.timestamp || 0)))
    .slice(0, MAX_ENTRIES)
    .map((item, i) => ({ ...item, rank: i + 1 }));
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

// KV is eventually consistent, so this is an abuse brake, not an exact counter. Only accepted
// submissions consume budget; expired Turnstile tokens or typos do not lock a visitor out.
// IPv6 addresses are normalized to their /64 prefix (first 4 hextets) so rotating the
// 64-bit interface identifier within a single client subnet cannot bypass the rate limit.
function normalizeIpKey(ip) {
  if (!ip || typeof ip !== "string") return "";
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed.includes(":")) return trimmed;
  // Expand IPv6 "::" zero-compression and normalize first 4 hextets (/64 prefix)
  const halves = trimmed.split("::");
  if (halves.length > 2) return trimmed;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = Math.max(0, 8 - (left.length + right.length));
  const full = [...left, ...Array(missing).fill("0"), ...right].map((h) => h.padStart(4, "0"));
  if (full.length >= 4) {
    return `${full.slice(0, 4).join(":")}::/64`;
  }
  return trimmed;
}

async function rateLimitState(kv, ip) {
  const key = normalizeIpKey(ip);
  if (!kv || !key) return { limited: false, count: 0 };
  const count = Number(await kv.get(`rl:${key}`)) || 0;
  return { limited: count >= RATE_LIMIT_MAX, count };
}

async function consumeRateBudget(kv, ip, count) {
  const key = normalizeIpKey(ip);
  if (!kv || !key) return;
  await kv.put(`rl:${key}`, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
}

export async function onRequestOptions() {
  return json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD, POST" });
}

export async function onRequestGet(context) {
  try {
    const kv = getKV(context.env);
    if (kv) {
      const stored = await kv.get(BOARD_KEY, "json");
      return json(rankBoard(cleanBoard(stored)), 200, GET_CACHE);
    }
  } catch (err) {
    console.warn("leaderboard GET error", err);
    return json([], 200); // no-store on transient KV error so edge does not cache empty fallback
  }
  return json([], 200, GET_CACHE);
}

export async function onRequestHead(context) {
  const res = await onRequestGet(context);
  return new Response(null, { status: res.status, headers: res.headers });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!sameOrigin(request)) return json({ error: "forbidden_origin" }, 403);

    const secret = typeof env?.TURNSTILE_SECRET_KEY === "string" ? env.TURNSTILE_SECRET_KEY.trim() : "";
    if (!secret) return json({ error: "board_disabled" }, 503);

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);

    const declaredLen = Number(request.headers.get("Content-Length") || 0);
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

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
    const rate = await rateLimitState(kv, ip);
    if (rate.limited) return json({ error: "rate_limited" }, 429, { "Retry-After": String(RATE_LIMIT_WINDOW_SEC) });

    // Validate the cheap fields before spending a siteverify call.
    const handle = normalizeHandle(body.handle);
    const score = body.score;
    const cards = body.cards;
    if (!handle || handle.length < 2 || LEGACY_SEEDS.has(handle.toLowerCase())) return json({ error: "invalid_handle" }, 400);
    if (!Number.isInteger(score) || score < 12 || score > 50000) return json({ error: "invalid_score" }, 400);
    if (cards !== 12) return json({ error: "collection_incomplete" }, 400);

    if (!(await verifyTurnstile(secret, body.turnstileToken, ip))) return json({ error: "verification_failed" }, 403);

    const entry = {
      handle,
      score,
      tier: tierFor(score),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timestamp: Date.now(),
    };

    if (!kv) return json({ ok: true, board: [{ ...entry, rank: 1 }], stored: false });

    await consumeRateBudget(kv, ip, rate.count);

    const list = cleanBoard(await kv.get(BOARD_KEY, "json"));
    const idx = list.findIndex((e) => e.handle.toLowerCase() === handle.toLowerCase());
    let mutated = false;
    if (idx !== -1) {
      if (score < list[idx].score) {
        list[idx] = entry;
        mutated = true;
      }
    } else {
      list.push(entry);
      mutated = true;
    }
    const ranked = rankBoard(list);
    if (mutated) {
      await kv.put(BOARD_KEY, JSON.stringify(ranked));
    }
    return json({ ok: true, board: ranked, stored: true });
  } catch (err) {
    console.warn("leaderboard POST error", err);
    return json({ error: "server_error" }, 500);
  }
}
