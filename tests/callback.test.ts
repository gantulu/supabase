import { assertEquals } from "jsr:@std/assert";

Deno.test("callback handler does not accept unsupported methods", async () => {
  const response = await fetch("http://localhost:8000/duitku-callback", {
    method: "GET",
  });
  assertEquals(response.status, 405);
});
