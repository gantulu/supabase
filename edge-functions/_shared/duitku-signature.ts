/**
 * Duitku POP HMAC-SHA256 signatures.
 *
 * Create Invoice: HMAC_SHA256(merchantCode + timestamp, API key)
 * Callback:       HMAC_SHA256(merchantCode + amount + merchantOrderId, API key)
 *
 * The legacy SHA-256-only Create Invoice signature is obsolete per official docs.
 */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function createInvoiceStringToSign(
  merchantCode: string,
  timestamp: string,
): string {
  return merchantCode + timestamp;
}

export async function createInvoiceSignature(
  merchantCode: string,
  timestamp: string,
  apiKey: string,
): Promise<string> {
  return await hmacSha256Hex(
    apiKey,
    createInvoiceStringToSign(merchantCode, timestamp),
  );
}

export function callbackStringToSign(
  merchantCode: string,
  amount: string,
  merchantOrderId: string,
): string {
  return merchantCode + amount + merchantOrderId;
}

export async function callbackSignature(
  merchantCode: string,
  amount: string,
  merchantOrderId: string,
  apiKey: string,
): Promise<string> {
  return await hmacSha256Hex(
    apiKey,
    callbackStringToSign(merchantCode, amount, merchantOrderId),
  );
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
