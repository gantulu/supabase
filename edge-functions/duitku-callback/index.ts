import { callbackSignature, constantTimeEqual } from "../_shared/duitku-signature.ts";
import { loadDuitkuConfig } from "../_shared/duitku-client.ts";
import { jsonResponse, methodNotAllowed } from "../_shared/response.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return jsonResponse({ error: "unsupported_content_type" }, 415);
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return jsonResponse({ error: "invalid_callback_payload" }, 400);
  }

  const merchantCode = form.get("merchantCode");
  const amount = form.get("amount");
  const merchantOrderId = form.get("merchantOrderId");
  const signature = form.get("signature");
  const resultCode = form.get("resultCode");

  if (!merchantCode || !amount || !merchantOrderId || !signature || !resultCode) {
    return jsonResponse({ error: "missing_callback_fields" }, 400);
  }

  let config;
  try {
    config = loadDuitkuConfig();
  } catch {
    return jsonResponse({ error: "server_configuration_error" }, 500);
  }

  if (merchantCode !== config.merchantCode) {
    return jsonResponse({ error: "merchant_code_mismatch" }, 401);
  }

  let expectedSignature: string;
  try {
    expectedSignature = await callbackSignature(
      merchantCode,
      amount,
      merchantOrderId,
      config.apiKey,
    );
  } catch {
    return jsonResponse({ error: "signature_verification_error" }, 500);
  }

  if (!constantTimeEqual(signature.toLowerCase(), expectedSignature)) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  // Official docs conflict on callback failure codes: the callback section lists
  // 01=Failed, while the API response table lists 02=Failed. Only 00=Success
  // is consistent. Do not finalize a failure until Duitku confirms the contract.
  const outcome = resultCode === "00" ? "paid_candidate" : "needs_review";

  // Persisting the verified callback, validating the exact amount against the
  // stored order, and applying idempotent state transitions requires the trusted
  // callback RPC. Do not acknowledge before that persistence exists, or a retry
  // could be lost. No order/payment state is changed by this handler yet.
  return jsonResponse({
    error: "callback_persistence_not_configured",
    outcome,
    payment_status: outcome === "needs_review" ? "needs_review" : "pending",
  }, 503);
});
