import { assertEquals } from "jsr:@std/assert";
import { constantTimeEqual, hmacSha256Hex } from "../edge-functions/_shared/duitku-signature.ts";

Deno.test("HMAC helper returns deterministic lowercase hex", async () => {
  const signature = await hmacSha256Hex("secret", "message");
  assertEquals(signature.length, 64);
  assertEquals(signature, await hmacSha256Hex("secret", "message"));
});

Deno.test("constant-time comparison helper compares exact strings", () => {
  assertEquals(constantTimeEqual("abcd", "abcd"), true);
  assertEquals(constantTimeEqual("abcd", "abce"), false);
  assertEquals(constantTimeEqual("abc", "abcd"), false);
});
