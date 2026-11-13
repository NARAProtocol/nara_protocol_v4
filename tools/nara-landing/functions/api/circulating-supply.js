// Cloudflare Pages Function: /api/circulating-supply
// Plain-text numeric endpoint compatible with CoinGecko, CoinMarketCap, and analytics trackers.
//
// Default: returns circulating supply excluding protocol vaults AND commitments locked > 1 day.
// Optional query params:
//   ?mode=protocol-only  excludes only protocol vaults (keeps all staked commitments circulating)
//   ?format=json         returns full JSON breakdown

import {
  readSupplySnapshot,
  buildPublicSupplyReport,
  textResponse,
  jsonResponse,
  methodNotAllowedResponse,
  optionsResponse,
} from "../_shared/supplyCore.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const format = url.searchParams.get("format");

  try {
    const snap = await readSupplySnapshot(env);
    if (format === "json") {
      return jsonResponse(buildPublicSupplyReport(snap), 200);
    }
    const value = mode === "protocol-only" ? snap.protocolOnlyCirculatingSupply : snap.circulatingSupply;
    return textResponse(value, 200);
  } catch {
    return format === "json"
      ? jsonResponse({ error: "upstream_rpc_unavailable" }, 503)
      : textResponse("upstream_rpc_unavailable", 503);
  }
}

export async function onRequestHead(ctx) {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "GET") return onRequestGet(ctx);
  if (m === "HEAD") return onRequestHead(ctx);
  if (m === "OPTIONS") return onRequestOptions();
  return methodNotAllowedResponse();
}
