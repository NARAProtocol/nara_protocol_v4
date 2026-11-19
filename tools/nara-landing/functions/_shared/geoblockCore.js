export const SANCTIONED_COUNTRIES = Object.freeze(new Set(["CU", "IR", "KP", "SY"]));
export const SANCTIONED_UA_REGIONS = Object.freeze(new Set(["43", "40", "14", "09"]));

const EXEMPT_EXACT_PATHS = new Set([
  "/privacy",
  "/privacy/",
  "/privacy.html",
  "/privacy/index.html",
  "/terms",
  "/terms/",
  "/terms.html",
  "/terms/index.html",
  "/accessibility",
  "/accessibility/",
  "/accessibility.html",
  "/accessibility/index.html",
  "/api/supply",
  "/api/circulating-supply",
  "/api/total-supply",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/ai-facts.json",
]);

export function isSanctionedExemptPath(pathname) {
  const clean = String(pathname || "/");
  if (clean.startsWith("/.well-known/")) return true;
  return EXEMPT_EXACT_PATHS.has(clean);
}

export function detectSanctionedJurisdiction(request) {
  const cf = request?.cf || {};
  const country = String(cf.country || request?.headers?.get("CF-IPCountry") || "")
    .trim()
    .toUpperCase();
  const regionCode = String(cf.regionCode || request?.headers?.get("X-CF-Region-Code") || "")
    .trim()
    .toUpperCase();

  if (SANCTIONED_COUNTRIES.has(country)) {
    return { blocked: true, country, regionCode: regionCode || null };
  }
  if (country === "UA" && SANCTIONED_UA_REGIONS.has(regionCode)) {
    return { blocked: true, country, regionCode };
  }
  return { blocked: false, country: country || null, regionCode: regionCode || null };
}

export function enforceSanctionsGuard(request) {
  const url = new URL(request.url);
  if (isSanctionedExemptPath(url.pathname)) {
    return null;
  }
  const check = detectSanctionedJurisdiction(request);
  if (!check.blocked) {
    return null;
  }

  const baseHeaders = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };

  const accept = (request.headers.get("Accept") || "").toLowerCase();
  const wantsJson = url.pathname.startsWith("/api/") || (accept.includes("application/json") && !accept.includes("text/html"));

  if (wantsJson) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: "SANCTIONED_JURISDICTION",
        error: "Unavailable for legal reasons: this interface is not offered in comprehensively sanctioned jurisdictions.",
      }),
      {
        status: 451,
        statusText: "Unavailable For Legal Reasons",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <meta name="robots" content="noindex" />',
    "  <title>451 Unavailable For Legal Reasons — NARA Protocol</title>",
    "  <style>",
    "    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #070B12; color: #E2E8F0; font-family: system-ui, -apple-system, sans-serif; padding: 24px; }",
    "    main { max-width: 520px; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; background: #0D131F; padding: 28px; line-height: 1.6; }",
    "    h1 { margin: 0 0 12px; font-size: 1.25rem; color: #F8FAFC; }",
    "    p { margin: 0 0 14px; font-size: 0.92rem; color: #94A3B8; }",
    "    a { color: #39FF14; text-decoration: underline; margin-right: 14px; font-size: 0.85rem; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <h1>451 — Unavailable For Legal Reasons</h1>",
    "    <p>This web interface is not available in comprehensively sanctioned jurisdictions (including Cuba, Iran, North Korea, Syria, and covered regions). Underlying smart contracts on Base are autonomous open-source software not custodied by website contributors.</p>",
    '    <nav aria-label="Legal notices"><a href="/terms">Terms of Use</a><a href="/privacy">Privacy Policy</a><a href="/accessibility">Accessibility</a></nav>',
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");

  return new Response(html, {
    status: 451,
    statusText: "Unavailable For Legal Reasons",
    headers: {
      ...baseHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
