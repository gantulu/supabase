import { jsonResponse, methodNotAllowed } from "../_shared/response.ts";
import { isRecord } from "../_shared/validation.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return methodNotAllowed();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (!isRecord(body)) {
    return jsonResponse({ error: "invalid_callback_payload" }, 400);
  }

  // Do not mutate order/payment state until the exact official signature formula,
  // result-code mapping, amount validation, and inquiry contract are verified.
  // Unknown or conflicting callback outcomes must be retained for review.
  return jsonResponse({
    error: "callback_contract_not_enabled",
    payment_status: "needs_review",
  }, 503);
});
