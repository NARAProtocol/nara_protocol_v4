// Cloudflare Pages Function: /api/total-supply
// Plain-text numeric endpoint returning NARA net total supply (totalSupply minus 0x...dEaD burns).

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
  const format = url.searchParams.get("format");

  try {
    const snap = await readSupplySnapshot(env);
    if (format === "json") {
      return jsonResponse(buildPublicSupplyReport(snap), 200);
    }
    return textResponse(snap.totalSupply, 200);
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
