import { assertEquals } from "jsr:@std/assert";

Deno.test("create invoice rejects non-POST requests", async () => {
  const response = await fetch("http://localhost:8000/duitku-create-invoice", {
    method: "GET",
  });
  assertEquals(response.status, 405);
});
