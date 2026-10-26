import { jsonResponse, methodNotAllowed } from "../_shared/response.ts";
import { isRecord, nonEmptyString } from "../_shared/validation.ts";
import { loadDuitkuConfig } from "../_shared/duitku-client.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return methodNotAllowed();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (!isRecord(body) || !Array.isArray(body.items) ||
    body.items.length === 0 ||
    !nonEmptyString(body.idempotency_key, 200) ||
    !isRecord(body.customer)) {
    return jsonResponse({ error: "invalid_checkout_payload" }, 400);
  }

  try {
    const config = loadDuitkuConfig();
    // TODO: validate item IDs/quantities against asr_products and calculate totals
    // inside a trusted transactional RPC; never trust client prices or totals.
    // TODO: create an idempotent order and invoice after the official Create Invoice
    // request contract and callback/inquiry blockers are verified.
    return jsonResponse({
      error: "payment_contract_not_enabled",
      environment: config.environment,
      message: "Invoice creation is not enabled until provider contract verification is complete.",
    }, 503);
  } catch {
    return jsonResponse({ error: "server_configuration_error" }, 500);
  }
});
