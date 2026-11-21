import { handleWebauthnRequest } from "./_shared/webauthnCore.js";
import { enforceSanctionsGuard } from "./_shared/geoblockCore.js";

export async function onRequest(context) {
  const blocked = enforceSanctionsGuard(context.request);
  if (blocked) {
    return blocked;
  }
  const url = new URL(context.request.url);
  if (url.pathname === "/.well-known/webauthn") {
    return handleWebauthnRequest(context.request);
  }
  return context.next();
}
