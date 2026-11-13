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
const ADMIN_FAIL_MAX = 5;           // failed admin auth attempts per IP per window
const VERIFY_FAIL_MAX = 30;         // failed verify attempts per IP per window
const TURNSTILE_ACTION = "fame_board_submit";
const TURNSTILE_TIMEOUT_MS = 8000;
const RATE_LIMIT_WINDOW_SEC = 3600; // KV minimum TTL is 60s; one hour keeps churn low
const LEGACY_SEEDS = new Set(["@satoshi_plunger", "@vitalik_roll", "@base_general", "@degen_harvester", "@sewer_sniper"]);
const NARA_TOKEN_LC = "0x91fb78a9f46b67f54bbd4489941d19666b2fae0f";
const ZERO_ADDRESS_LC = "0x0000000000000000000000000000000000000000";
const PLATFORMS = new Set(["x", "tg", "fc"]);
const HEX64_RE = /^[a-f0-9]{64}$/;
const CLAIM_CODE_RE = /^NARA-[A-F0-9]{4}-[A-F0-9]{4}$/i;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
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

function normalizePlatform(raw) {
  if (raw === undefined || raw === null || raw === "") return "x";
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "x" || v === "twitter") return "x";
  if (v === "tg" || v === "telegram") return "tg";
  if (v === "fc" || v === "farcaster" || v === "warpcast") return "fc";
  return null;
}

function normalizeWallet(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null;
  const lc = trimmed.toLowerCase();
  if (lc === ZERO_ADDRESS_LC || lc === NARA_TOKEN_LC) return null;
  return trimmed;
}

function normalizePostUrl(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length > 180) return null;
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com" || host === "mobile.twitter.com") {
    const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,20})\/status\/(\d{5,25})\/?$/);
    return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
  }
  if (host === "warpcast.com" || host === "www.warpcast.com" || host === "farcaster.xyz" || host === "www.farcaster.xyz") {
    const m = u.pathname.match(/^\/([A-Za-z0-9_.-]{1,30})\/(0x[a-fA-F0-9]{4,64})\/?$/);
    return m ? `https://warpcast.com/${m[1]}/${m[2]}` : null;
  }
  return null;
}

function normalizeOperatorKey(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(trimmed) ? trimmed : null;
}

function maskWallet(wallet) {
  if (!wallet || typeof wallet !== "string" || wallet.length < 12) return "";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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
    const row = {
      handle,
      score,
      tier: tierFor(score),
      date: typeof item.date === "string" ? item.date.slice(0, 24) : "",
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : 0,
    };
    const platform = typeof item.platform === "string" ? item.platform.trim().toLowerCase() : "";
    if (PLATFORMS.has(platform)) row.platform = platform;
    const wallet = normalizeWallet(item.wallet);
    if (wallet) row.wallet = wallet;
    const postUrl = normalizePostUrl(item.postUrl);
    if (postUrl) row.postUrl = postUrl;
    if (typeof item.keyHash === "string" && HEX64_RE.test(item.keyHash)) row.keyHash = item.keyHash;
    if (typeof item.claimHash === "string" && HEX64_RE.test(item.claimHash)) row.claimHash = item.claimHash;
    out.push(row);
  }
  return out;
}

function rankBoard(list) {
  return [...list]
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : (a.timestamp || 0) - (b.timestamp || 0)))
    .slice(0, MAX_ENTRIES)
    .map((item, i) => ({ ...item, rank: i + 1 }));
}

function publicBoard(rankedList) {
  return rankedList.map((item) => {
    const out = {
      handle: item.handle,
      score: item.score,
      tier: item.tier,
      date: item.date,
      timestamp: item.timestamp,
      rank: item.rank,
    };
    if (item.platform) out.platform = item.platform;
    if (item.postUrl) out.postUrl = item.postUrl;
    if (item.wallet) out.walletHint = maskWallet(item.wallet);
    if (item.wallet || item.postUrl || item.claimHash) out.awardReady = true;
    return out;
  });
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

function isAllowedTurnstileHost(reportedHost, requestUrl) {
  const rep = typeof reportedHost === "string" ? reportedHost.trim().toLowerCase() : "";
  if (!rep) return false;
  let reqHost = "";
  try {
    reqHost = new URL(requestUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (reqHost === "naraprotocol.io" || reqHost === "www.naraprotocol.io") {
    return rep === "naraprotocol.io" || rep === "www.naraprotocol.io";
  }
  if (reqHost === "nara-landing-6wd.pages.dev" || reqHost.endsWith(".nara-landing-6wd.pages.dev")) {
    return rep === reqHost || rep === "nara-landing-6wd.pages.dev";
  }
  return false;
}

async function verifyTurnstile(secret, token, ip, requestUrl) {
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
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || data.success !== true) return false;
    if (!secret.startsWith("1x0000000000000000000000000000000")) {
      if (data.action !== TURNSTILE_ACTION) return false;
      if (!isAllowedTurnstileHost(data.hostname, requestUrl)) return false;
    }
    return true;
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
  const trimmed = ip
    .trim()
    .toLowerCase()
    .replace(/^(?:0+:){5}ffff:/, "")
    .replace(/^::ffff:/, "");
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

async function bucketCount(kv, prefix, ip) {
  const key = normalizeIpKey(ip);
  if (!kv || !key) return 0;
  return Number(await kv.get(`${prefix}:${key}`)) || 0;
}

async function bumpBucket(kv, prefix, ip, count) {
  const key = normalizeIpKey(ip);
  if (!kv || !key) return;
  await kv.put(`${prefix}:${key}`, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
}

async function rateLimitState(kv, ip) {
  const count = await bucketCount(kv, "rl", ip);
  return { limited: count >= RATE_LIMIT_MAX, count };
}

async function consumeRateBudget(kv, ip, count) {
  await bumpBucket(kv, "rl", ip, count);
}

export async function onRequestOptions() {
  return json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD, POST" });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const kv = getKV(env);

    // 1. Public Claim Pass verification: GET /api/leaderboard?verify=1&handle=@...&claim=NARA-XXXX-XXXX
    if (url.searchParams.get("verify") === "1") {
      const ip = request.headers.get("CF-Connecting-IP") || "";
      const vCount = await bucketCount(kv, "rl_verify", ip);
      if (vCount >= VERIFY_FAIL_MAX) {
        return json({ ok: false, valid: false, error: "rate_limited" }, 429, { "Retry-After": String(RATE_LIMIT_WINDOW_SEC) });
      }
      const handle = normalizeHandle(url.searchParams.get("handle") || "");
      const claimRaw = (url.searchParams.get("claim") || url.searchParams.get("code") || "").trim().toUpperCase();
      if (!handle || handle.length < 2 || !CLAIM_CODE_RE.test(claimRaw)) {
        return json({ ok: true, valid: false, reason: "invalid_format" }, 200);
      }
      const stored = kv ? await kv.get(BOARD_KEY, "json") : [];
      const ranked = rankBoard(cleanBoard(stored));
      const entry = ranked.find((e) => e.handle.toLowerCase() === handle.toLowerCase());
      if (!entry || !entry.claimHash) {
        await bumpBucket(kv, "rl_verify", ip, vCount);
        return json({ ok: true, valid: false }, 200);
      }
      const expectedHash = await sha256Hex(`nara-claim-verify-v1:${handle.toLowerCase()}:${claimRaw}`);
      const valid = constantTimeEqualHex(expectedHash, entry.claimHash);
      if (!valid) {
        await bumpBucket(kv, "rl_verify", ip, vCount);
        return json({ ok: true, valid: false }, 200);
      }
      return json({
        ok: true,
        valid: true,
        handle: entry.handle,
        rank: entry.rank,
        score: entry.score,
        tier: entry.tier,
        platform: entry.platform || "x",
        postUrl: entry.postUrl || "",
        walletHint: entry.wallet ? maskWallet(entry.wallet) : "",
        hasWallet: Boolean(entry.wallet),
        date: entry.date,
      }, 200);
    }

    // 2. Owner/Team Award Payout Roster: GET /api/leaderboard?admin=1 (Authorization: Bearer <AWARD_ADMIN_TOKEN>)
    if (url.searchParams.get("admin") === "1") {
      const adminSecret = typeof env?.AWARD_ADMIN_TOKEN === "string" ? env.AWARD_ADMIN_TOKEN.trim() : "";
      if (adminSecret.length < 24) {
        return json({ error: "admin_disabled" }, 503);
      }
      const ip = request.headers.get("CF-Connecting-IP") || "";
      const aCount = await bucketCount(kv, "rl_admin", ip);
      if (aCount >= ADMIN_FAIL_MAX) {
        return json({ error: "rate_limited" }, 429, { "Retry-After": String(RATE_LIMIT_WINDOW_SEC) });
      }
      const auth = request.headers.get("Authorization") || "";
      const match = auth.match(/^Bearer\s+(.+)$/i);
      const provided = match ? match[1].trim() : "";
      if (!provided) {
        await bumpBucket(kv, "rl_admin", ip, aCount);
        return json({ error: "forbidden" }, 403);
      }
      const [aHash, bHash] = await Promise.all([sha256Hex(provided), sha256Hex(adminSecret)]);
      if (!constantTimeEqualHex(aHash, bHash)) {
        await bumpBucket(kv, "rl_admin", ip, aCount);
        return json({ error: "forbidden" }, 403);
      }
      const stored = kv ? await kv.get(BOARD_KEY, "json") : [];
      const ranked = rankBoard(cleanBoard(stored));
      return json({
        ok: true,
        count: ranked.length,
        entries: ranked.map((e) => ({
          rank: e.rank,
          handle: e.handle,
          platform: e.platform || "x",
          score: e.score,
          tier: e.tier,
          wallet: e.wallet || "",
          postUrl: e.postUrl || "",
          awardReady: Boolean(e.wallet || e.postUrl || e.claimHash),
          hasClaimPass: Boolean(e.claimHash),
          date: e.date,
          timestamp: e.timestamp,
        })),
      }, 200);
    }

    // 3. Standard Public Leaderboard
    if (kv) {
      const stored = await kv.get(BOARD_KEY, "json");
      return json(publicBoard(rankBoard(cleanBoard(stored))), 200, GET_CACHE);
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
    const hasExplicitPlatform = body.platform !== undefined && body.platform !== null && body.platform !== "";
    const platform = normalizePlatform(body.platform);
    const wallet = normalizeWallet(body.wallet);
    const postUrl = normalizePostUrl(body.postUrl);
    const operatorKey = normalizeOperatorKey(body.operatorKey);

    if (!handle || handle.length < 2 || LEGACY_SEEDS.has(handle.toLowerCase())) return json({ error: "invalid_handle" }, 400);
    if (!Number.isInteger(score) || score < 12 || score > 50000) return json({ error: "invalid_score" }, 400);
    if (cards !== 12) return json({ error: "collection_incomplete" }, 400);
    if (platform === null) return json({ error: "invalid_platform" }, 400);
    if (wallet === null) return json({ error: "invalid_wallet" }, 400);
    if (postUrl === null) return json({ error: "invalid_post_url" }, 400);
    if (operatorKey === null) return json({ error: "invalid_operator_key" }, 400);

    if (!(await verifyTurnstile(secret, body.turnstileToken, ip, request.url))) return json({ error: "verification_failed" }, 403);

    let keyHash = "";
    let claimCode = "";
    let claimHash = "";
    if (operatorKey) {
      keyHash = await sha256Hex(`nara-op-key-v1:${handle.toLowerCase()}:${operatorKey}`);
      const claimSalt = (typeof env?.AWARD_CLAIM_SALT === "string" && env.AWARD_CLAIM_SALT.trim()) || secret;
      const claimDigest = await sha256Hex(`nara-claim-v1:${claimSalt}:${handle.toLowerCase()}:${keyHash}`);
      claimCode = `NARA-${claimDigest.slice(0, 4).toUpperCase()}-${claimDigest.slice(4, 8).toUpperCase()}`;
      claimHash = await sha256Hex(`nara-claim-verify-v1:${handle.toLowerCase()}:${claimCode}`);
    }

    const nowDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const entry = {
      handle,
      score,
      tier: tierFor(score),
      date: nowDate,
      timestamp: Date.now(),
      ...(hasExplicitPlatform || wallet || postUrl || operatorKey ? { platform } : {}),
      ...(wallet ? { wallet } : {}),
      ...(postUrl ? { postUrl } : {}),
      ...(keyHash ? { keyHash } : {}),
      ...(claimHash ? { claimHash } : {}),
    };

    if (!kv) {
      return json({
        ok: true,
        board: publicBoard([{ ...entry, rank: 1 }]),
        stored: false,
        ...(claimCode ? { claimCode } : {}),
      });
    }

    const list = cleanBoard(await kv.get(BOARD_KEY, "json"));
    const idx = list.findIndex((e) => e.handle.toLowerCase() === handle.toLowerCase());

    // Anti-hijack ownership enforcement before consuming rate budget or mutating KV
    if (idx !== -1 && list[idx].keyHash) {
      if (!keyHash || !constantTimeEqualHex(keyHash, list[idx].keyHash)) {
        return json({
          error: "handle_locked",
          message: "Handle is bound to another browser Award Pass. Choose a unique handle.",
        }, 403);
      }
    }

    await consumeRateBudget(kv, ip, rate.count);

    let mutated = false;
    if (idx !== -1) {
      const existing = list[idx];
      const nextScore = Math.min(existing.score, score);
      const improvedScore = score < existing.score;
      const nextPlatform = hasExplicitPlatform ? platform : (existing.platform || "");
      const nextWallet = wallet || existing.wallet || "";
      const nextPostUrl = postUrl || existing.postUrl || "";
      const nextKeyHash = keyHash || existing.keyHash || "";
      const nextClaimHash = claimHash || existing.claimHash || "";

      if (
        improvedScore ||
        nextPlatform !== (existing.platform || "") ||
        nextWallet !== (existing.wallet || "") ||
        nextPostUrl !== (existing.postUrl || "") ||
        nextKeyHash !== (existing.keyHash || "") ||
        nextClaimHash !== (existing.claimHash || "")
      ) {
        list[idx] = {
          handle,
          score: nextScore,
          tier: tierFor(nextScore),
          date: improvedScore ? nowDate : (existing.date || nowDate),
          timestamp: improvedScore ? entry.timestamp : existing.timestamp,
          ...(nextPlatform ? { platform: nextPlatform } : {}),
          ...(nextWallet ? { wallet: nextWallet } : {}),
          ...(nextPostUrl ? { postUrl: nextPostUrl } : {}),
          ...(nextKeyHash ? { keyHash: nextKeyHash } : {}),
          ...(nextClaimHash ? { claimHash: nextClaimHash } : {}),
        };
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
    return json({
      ok: true,
      board: publicBoard(ranked),
      stored: true,
      ...(claimCode ? { claimCode } : {}),
    });
  } catch (err) {
    console.warn("leaderboard POST error", err);
    return json({ error: "server_error" }, 500);
  }
}
