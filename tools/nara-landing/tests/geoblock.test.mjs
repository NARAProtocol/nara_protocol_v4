import test from "node:test";
import assert from "node:assert/strict";
import { detectSanctionedJurisdiction, enforceSanctionsGuard } from "../functions/_shared/geoblockCore.js";
import { onRequest as onMiddlewareRequest } from "../functions/_middleware.js";

test("blocks comprehensively embargoed countries (CU, IR, KP, SY) with HTTP 451", async () => {
  for (const country of ["CU", "IR", "KP", "SY"]) {
    const htmlReq = new Request("https://naraprotocol.io/vault", {
      headers: { Accept: "text/html", "CF-IPCountry": country },
    });
    const htmlRes = await onMiddlewareRequest({
      request: htmlReq,
      next: async () => new Response("ok", { status: 200 }),
    });
    assert.equal(htmlRes.status, 451, `expected 451 for ${country}`);
    assert.match(htmlRes.headers.get("content-type") || "", /text\/html/);
    assert.equal(htmlRes.headers.get("cache-control"), "no-store");
    const text = await htmlRes.text();
    assert.match(text, /Unavailable For Legal Reasons/);

    const apiReq = new Request("https://naraprotocol.io/api/quote?summary=1", {
      headers: { Accept: "application/json", "CF-IPCountry": country },
    });
    const apiRes = await onMiddlewareRequest({
      request: apiReq,
      next: async () => new Response("ok", { status: 200 }),
    });
    assert.equal(apiRes.status, 451);
    const json = await apiRes.json();
    assert.equal(json.ok, false);
    assert.equal(json.code, "SANCTIONED_JURISDICTION");
  }
});

test("blocks covered UA regions (43, 40, 14, 09) while allowing non-embargoed UA regions", () => {
  for (const region of ["43", "40", "14", "09"]) {
    const req = new Request("https://naraprotocol.io/", {
      headers: { "CF-IPCountry": "UA", "X-CF-Region-Code": region },
    });
    assert.equal(detectSanctionedJurisdiction(req).blocked, true);
    assert.equal(enforceSanctionsGuard(req)?.status, 451);
  }

  const kyivReq = new Request("https://naraprotocol.io/", {
    headers: { "CF-IPCountry": "UA", "X-CF-Region-Code": "30" },
  });
  assert.equal(detectSanctionedJurisdiction(kyivReq).blocked, false);
  assert.equal(enforceSanctionsGuard(kyivReq), null);
});

test("keeps legal notices, WebAuthn ROR, and read-only supply APIs exempt from 451", async () => {
  for (const exemptPath of [
    "/.well-known/webauthn",
    "/.well-known/security.txt",
    "/privacy",
    "/terms",
    "/accessibility",
    "/api/supply",
    "/api/circulating-supply",
    "/api/total-supply",
  ]) {
    const req = new Request(`https://naraprotocol.io${exemptPath}`, {
      headers: { "CF-IPCountry": "IR" },
    });
    const res = await onMiddlewareRequest({
      request: req,
      next: async () => new Response("passed-through", { status: 200 }),
    });
    assert.equal(res.status, 200, `${exemptPath} must remain reachable`);
  }
});
