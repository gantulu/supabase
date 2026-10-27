import { createClient } from "npm:@supabase/supabase-js@2";
import { callbackSignature, constantTimeEqual } from "../_shared/duitku-signature.ts";
import { loadDuitkuConfig } from "../_shared/duitku-client.ts";
import { jsonResponse, methodNotAllowed } from "../_shared/response.ts";
import { isRecord, nonEmptyString } from "../_shared/validation.ts";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase server configuration is incomplete");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return methodNotAllowed();

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return jsonResponse({ error: "unsupported_content_type" }, 415);
  }

  let form: URLSearchParams;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 64_000) return jsonResponse({ error: "callback_payload_too_large" }, 413);
    form = new URLSearchParams(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_callback_payload" }, 400);
  }

  const merchantCode = form.get("merchantCode");
  const amount = form.get("amount");
  const merchantOrderId = form.get("merchantOrderId");
  const reference = form.get("reference");
  const signature = form.get("signature");
  const resultCode = form.get("resultCode");

  if (!nonEmptyString(merchantCode, 100) || !nonEmptyString(amount, 30) ||
      !nonEmptyString(merchantOrderId, 50) || !nonEmptyString(reference, 255) ||
      !nonEmptyString(signature, 256) || !nonEmptyString(resultCode, 20)) {
    return jsonResponse({ error: "missing_or_invalid_callback_fields" }, 400);
  }

  let config;
  let supabase;
  try {
    config = loadDuitkuConfig();
    supabase = serviceClient();
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

  // Persist only a small allowlist of callback fields; never store the signature or raw form body.
  const callbackPayload = {
    resultCode,
    paymentCode: form.get("paymentCode"),
    publisherOrderId: form.get("publisherOrderId"),
    settlementDate: form.get("settlementDate"),
    issuerCode: form.get("issuerCode"),
    transactionState: form.get("transactionState"),
    transactionStateStatus: form.get("transactionStateStatus"),
  };

  const { data, error } = await supabase.rpc("asr_process_duitku_callback", {
    p_merchant_code: merchantCode,
    p_amount: amount,
    p_merchant_order_id: merchantOrderId,
    p_reference: reference,
    p_result_code: resultCode,
    p_callback_payload: callbackPayload,
  });

  if (error || !isRecord(data) || typeof data.status !== "string") {
    // Do not acknowledge a callback that was not durably persisted; Duitku will retry.
    return jsonResponse({ error: "callback_persistence_failed" }, 500);
  }

  if (data.status === "not_found") {
    return jsonResponse({ error: "payment_not_found" }, 404);
  }

  // needs_review is a successfully persisted outcome, not a callback-processing failure.
  // Return HTTP 200 so retries do not obscure the review state with duplicate deliveries.
  return jsonResponse({
    received: true,
    status: data.status,
    ...(data.duplicate === true ? { duplicate: true } : {}),
  }, 200);
});
