export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function methodNotAllowed(allowed = "POST"): Response {
  return jsonResponse(
    { error: "method_not_allowed", allowed },
    405,
    { allow: allowed },
  );
}
