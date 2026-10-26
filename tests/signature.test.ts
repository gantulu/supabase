import { assertEquals } from "jsr:@std/assert";
import {
  callbackStringToSign,
  callbackSignature,
  constantTimeEqual,
  createInvoiceSignature,
  createInvoiceStringToSign,
  hmacSha256Hex,
} from "../edge-functions/_shared/duitku-signature.ts";

Deno.test("HMAC helper returns deterministic lowercase hex", async () => {
  const signature = await hmacSha256Hex("secret", "message");
  assertEquals(signature.length, 64);
  assertEquals(signature, await hmacSha256Hex("secret", "message"));
  assertEquals(signature, signature.toLowerCase());
});

Deno.test("Create Invoice string-to-sign follows merchantCode + timestamp", () => {
  assertEquals(createInvoiceStringToSign("D123", "1773728479616"), "D1231773728479616");
});

Deno.test("Create Invoice signature is HMAC-SHA256 over documented input", async () => {
  const signature = await createInvoiceSignature("D123", "1773728479616", "api-key");
  assertEquals(signature.length, 64);
  assertEquals(
    signature,
    await hmacSha256Hex("api-key", "D1231773728479616"),
  );
});

Deno.test("Callback string-to-sign follows merchantCode + amount + merchantOrderId", () => {
  assertEquals(callbackStringToSign("D123", "150000", "ORDER-1"), "D123150000ORDER-1");
});

Deno.test("Callback signature is HMAC-SHA256 over documented input", async () => {
  const signature = await callbackSignature("D123", "150000", "ORDER-1", "api-key");
  assertEquals(signature.length, 64);
  assertEquals(
    signature,
    await hmacSha256Hex("api-key", "D123150000ORDER-1"),
  );
});

Deno.test("constant-time comparison helper compares exact strings", () => {
  assertEquals(constantTimeEqual("abcd", "abcd"), true);
  assertEquals(constantTimeEqual("abcd", "abce"), false);
  assertEquals(constantTimeEqual("abc", "abcd"), false);
});
