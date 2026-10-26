import { jsonResponse, methodNotAllowed } from "../_shared/response.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return methodNotAllowed();

  // TODO: authenticate either the signed-in owner or a guest token transported
  // in a header; compare only a server-side hash and return minimum status fields.
  // Do not expose customer details, address, items, callback payload, or secrets.
  return jsonResponse({ error: "order_status_authorization_not_configured" }, 501);
});
