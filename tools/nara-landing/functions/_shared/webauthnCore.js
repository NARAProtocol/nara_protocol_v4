export const WEBAUTHN_ROR_PAYLOAD = {
  origins: ["https://cryptoslip.eth.limo"],
};

const WEBAUTHN_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Serve WebAuthn Level 3 Related Origin Requests manifest with strict JSON Content-Type.
 */
export function handleWebauthnRequest(request) {
  const method = String(request?.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: WEBAUTHN_HEADERS });
  }
  if (method === "GET" || method === "HEAD") {
    return new Response(
      method === "HEAD" ? null : JSON.stringify(WEBAUTHN_ROR_PAYLOAD),
      { status: 200, headers: WEBAUTHN_HEADERS },
    );
  }
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: WEBAUTHN_HEADERS,
  });
}
