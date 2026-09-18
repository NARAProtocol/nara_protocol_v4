// Cloudflare Pages Function: /api/leaderboard
// Tracks All-Time Fame Board records (Fewest Clicks to complete 12/12 cards)

const DEFAULT_SEEDS = [];

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=15, s-maxage=30",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS
  });
}

export async function onRequestGet(context) {
  try {
    const kv = context?.env?.NARA_LEADERBOARD_KV || context?.env?.KV;
    if (kv) {
      const stored = await kv.get("fame_board_v1", "json");
      if (Array.isArray(stored)) {
        // Filter out any legacy dummy seeds
        const cleanList = stored.filter(item => 
          item && 
          item.handle !== "@Satoshi_Plunger" && 
          item.handle !== "@Vitalik_Roll" && 
          item.handle !== "@Base_General" && 
          item.handle !== "@Degen_Harvester" && 
          item.handle !== "@Sewer_Sniper"
        );
        return new Response(JSON.stringify(cleanList), {
          status: 200,
          headers: JSON_HEADERS
        });
      }
    }
  } catch (err) {
    console.warn("KV fetch error:", err);
  }

  // Fresh board starts completely empty
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: JSON_HEADERS
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }

    const rawHandle = typeof body.handle === "string" ? body.handle.trim() : "";
    const cleanHandle = (rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`)
      .replace(/[^a-zA-Z0-9_@.-]/g, "")
      .slice(0, 24);

    const score = Math.floor(Number(body.score));
    const cards = Math.floor(Number(body.cards));

    if (!cleanHandle || cleanHandle.length < 2) {
      return new Response(JSON.stringify({ error: "Invalid operator handle" }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }

    // Mathematical sanity: 12 unique cards require at least 12 flushes
    if (!Number.isFinite(score) || score < 12 || score > 50000) {
      return new Response(JSON.stringify({ error: "Invalid click score" }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }

    if (cards !== 12) {
      return new Response(JSON.stringify({ error: "Collection incomplete (requires 12/12 cards)" }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }

    // Determine tier
    let tier = "PERSISTENT BEAR SLAYER";
    if (score < 35) tier = "GOD-TIER PORCELAIN DEITY";
    else if (score < 50) tier = "ELITE SEWER TACTICIAN";
    else if (score < 70) tier = "CERTIFIED PURGER";

    const newEntry = {
      handle: cleanHandle,
      score: score,
      tier: tier,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      timestamp: Date.now()
    };

    const kv = context?.env?.NARA_LEADERBOARD_KV || context?.env?.KV;
    let list = [];

    if (kv) {
      const stored = await kv.get("fame_board_v1", "json");
      if (Array.isArray(stored)) {
        list = stored.filter(item => 
          item && 
          item.handle !== "@Satoshi_Plunger" && 
          item.handle !== "@Vitalik_Roll" && 
          item.handle !== "@Base_General" && 
          item.handle !== "@Degen_Harvester" && 
          item.handle !== "@Sewer_Sniper"
        );
      }

      // Check if user already exists with a worse score -> update to better score
      const existingIdx = list.findIndex(e => e.handle.toLowerCase() === cleanHandle.toLowerCase());
      if (existingIdx !== -1) {
        if (score < list[existingIdx].score) {
          list[existingIdx] = newEntry;
        }
      } else {
        list.push(newEntry);
      }

      // Sort by score ascending (least clicks first), break ties with timestamp
      list.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

      // Assign ranks & cap at top 50
      list = list.slice(0, 50).map((item, idx) => ({ ...item, rank: idx + 1 }));

      await kv.put("fame_board_v1", JSON.stringify(list));
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: JSON_HEADERS
      });
    }

    // If KV not active, return success with sanitized entry
    return new Response(JSON.stringify({ ok: true, entry: newEntry }), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Serverless submission error" }), {
      status: 500,
      headers: JSON_HEADERS
    });
  }
}
