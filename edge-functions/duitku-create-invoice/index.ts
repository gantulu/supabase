import { createClient } from "npm:@supabase/supabase-js@2";
import { createDuitkuInvoice, loadDuitkuConfig } from "../_shared/duitku-client.ts";
import { isRecord, nonEmptyString } from "../_shared/validation.ts";
import { jsonResponse, methodNotAllowed } from "../_shared/response.ts";

const corsHeaders = (origin: string | null, allowedOrigin: string | null): HeadersInit => ({
  "access-control-allow-origin": allowedOrigin ?? "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "vary": "Origin",
});

function response(
  request: Request,
  body: unknown,
  status = 200,
  allowedOrigin: string | null = Deno.env.get("APP_ORIGIN"),
): Response {
  return jsonResponse(body, status, corsHeaders(request.headers.get("origin"), allowedOrigin));
}

function requiredHttpsUrl(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  return url.toString();
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase server configuration is incomplete");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isItemDetails(value: unknown): value is Array<{ name: string; quantity: number; price: number }> {
  return Array.isArray(value) && value.length > 0 && value.every((item) =>
    isRecord(item) && typeof item.name === "string" &&
    Number.isInteger(item.quantity) && Number(item.quantity) > 0 &&
    Number.isInteger(item.price) && Number(item.price) >= 0
  );
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("APP_ORIGIN");
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigin) });
  }
  if (request.method !== "POST") return methodNotAllowed();

  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return response(request, { error: "origin_not_allowed" }, 403, allowedOrigin);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(request, { error: "invalid_json" }, 400, allowedOrigin);
  }

  if (!isRecord(body) || !Array.isArray(body.items) ||
      body.items.length < 1 || body.items.length > 50 ||
      !nonEmptyString(body.idempotency_key, 200) ||
      body.idempotency_key.length < 16 ||
      !isRecord(body.customer) ||
      !nonEmptyString(body.customer.name, 100) ||
      !nonEmptyString(body.customer.email, 255) ||
      !nonEmptyString(body.customer.phone, 50) ||
      !isRecord(body.shipping_address)) {
    return response(request, { error: "invalid_checkout_payload" }, 400, allowedOrigin);
  }

  const items: Array<{ product_id: string; quantity: number }> = [];
  for (const item of body.items) {
    if (!isRecord(item) || !nonEmptyString(item.productId, 64) ||
        !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 100) {
      return response(request, { error: "invalid_item" }, 400, allowedOrigin);
    }
    items.push({ product_id: item.productId, quantity: Number(item.quantity) });
  }

  const shippingCost = body.shipping_cost === undefined ? 0 : body.shipping_cost;
  if (typeof shippingCost !== "number" || !Number.isInteger(shippingCost) || shippingCost < 0) {
    return response(request, { error: "invalid_shipping_cost" }, 400, allowedOrigin);
  }

  let config;
  let callbackUrl: string;
  let returnUrl: string;
  let supabase;
  try {
    config = loadDuitkuConfig();
    callbackUrl = requiredHttpsUrl("DUITKU_CALLBACK_URL");
    returnUrl = requiredHttpsUrl("DUITKU_RETURN_URL");
    supabase = serviceClient();
  } catch {
    return response(request, { error: "server_configuration_error" }, 500, allowedOrigin);
  }

  const { data: orderData, error: orderError } = await supabase.rpc("asr_create_order_for_invoice", {
    p_idempotency_key: body.idempotency_key,
    p_customer_name: body.customer.name,
    p_customer_email: body.customer.email,
    p_customer_phone: body.customer.phone,
    p_shipping_address: body.shipping_address,
    p_items: items,
    p_shipping_cost: shippingCost,
    p_merchant_code: config.merchantCode,
  });

  if (orderError || !isRecord(orderData)) {
    // Keep database errors opaque to the caller; no provider request was made.
    return response(request, { error: "order_creation_failed" }, 422, allowedOrigin);
  }

  const order = orderData;
  if (!nonEmptyString(order.merchant_order_id, 50) ||
      !Number.isInteger(order.payment_amount) || Number(order.payment_amount) <= 0 ||
      !nonEmptyString(order.customer_email, 255) ||
      !nonEmptyString(order.product_details, 255) ||
      !isItemDetails(order.item_details)) {
    return response(request, { error: "order_record_invalid" }, 500, allowedOrigin);
  }

  if (order.payment_url && order.provider_reference) {
    return response(request, {
      order_id: order.order_id,
      order_number: order.order_number,
      payment_status: order.payment_status,
      reference: order.provider_reference,
      paymentUrl: order.payment_url,
    }, 200, allowedOrigin);
  }

  if (order.payment_status !== "pending") {
    return response(request, {
      error: "invoice_requires_reconciliation",
      order_number: order.order_number,
      payment_status: order.payment_status,
    }, 409, allowedOrigin);
  }

  const markNeedsReview = async (reason: string) => {
    await supabase.rpc("asr_mark_payment_needs_review", {
      p_merchant_order_id: order.merchant_order_id,
      p_reason: reason,
    });
  };

  let providerResult;
  try {
    providerResult = await createDuitkuInvoice(config, {
      paymentAmount: Number(order.payment_amount),
      merchantOrderId: order.merchant_order_id,
      productDetails: order.product_details,
      email: order.customer_email,
      phoneNumber: order.customer_phone,
      customerVaName: String(order.customer_name).slice(0, 20),
      itemDetails: order.item_details,
      callbackUrl,
      returnUrl,
      expiryPeriod: 10,
    });
  } catch {
    // A network timeout is ambiguous: Duitku may have created the invoice.
    await markNeedsReview("create_invoice_network_outcome_uncertain");
    return response(request, {
      error: "invoice_outcome_uncertain",
      order_number: order.order_number,
      payment_status: "needs_review",
    }, 502, allowedOrigin);
  }

  const invoice = providerResult.body;
  const expectedHost = config.environment === "sandbox" ? "app-sandbox.duitku.com" : "app-prod.duitku.com";
  let validPaymentUrl = false;
  try {
    const paymentUrl = new URL(invoice.paymentUrl ?? "");
    validPaymentUrl = paymentUrl.protocol === "https:" && paymentUrl.hostname === expectedHost;
  } catch {
    validPaymentUrl = false;
  }

  if (providerResult.httpStatus !== 200 || invoice.statusCode !== "00" ||
      !nonEmptyString(invoice.reference, 255) || !validPaymentUrl) {
    await markNeedsReview(`create_invoice_response_uncertain_http_${providerResult.httpStatus}`);
    return response(request, {
      error: "provider_invoice_not_confirmed",
      order_number: order.order_number,
      payment_status: "needs_review",
    }, 502, allowedOrigin);
  }

  const { data: saveResult, error: saveError } = await supabase.rpc("asr_save_duitku_invoice", {
    p_merchant_order_id: order.merchant_order_id,
    p_provider_reference: invoice.reference,
    p_payment_url: invoice.paymentUrl,
    p_provider_result_code: invoice.statusCode,
  });

  if (saveError || !isRecord(saveResult) || saveResult.status !== "pending" ||
      saveResult.payment_url !== invoice.paymentUrl) {
    await markNeedsReview("invoice_created_but_persistence_not_confirmed");
    return response(request, {
      error: "invoice_persistence_uncertain",
      order_number: order.order_number,
      payment_status: "needs_review",
    }, 502, allowedOrigin);
  }

  return response(request, {
    order_id: order.order_id,
    order_number: order.order_number,
    payment_status: "pending",
    reference: invoice.reference,
    paymentUrl: invoice.paymentUrl,
  }, 200, allowedOrigin);
});
