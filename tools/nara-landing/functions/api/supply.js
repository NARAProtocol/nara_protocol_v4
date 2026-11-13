// Cloudflare Pages Function: /api/supply
// Full JSON breakdown of NARA V5 total, locked, and circulating supply on Base Mainnet.

import {
  readSupplySnapshot,
  buildPublicSupplyReport,
  jsonResponse,
  methodNotAllowedResponse,
  optionsResponse,
} from "../_shared/supplyCore.js";

export async function onRequestGet({ env }) {
  try {
    const snap = await readSupplySnapshot(env);
    return jsonResponse(buildPublicSupplyReport(snap), 200);
  } catch {
    return jsonResponse({ error: "upstream_rpc_unavailable" }, 503);
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
