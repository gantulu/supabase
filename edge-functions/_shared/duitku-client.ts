import { createInvoiceSignature } from "./duitku-signature.ts";

export type DuitkuEnvironment = "sandbox" | "production";

export interface DuitkuConfig {
  environment: DuitkuEnvironment;
  merchantCode: string;
  apiKey: string;
}

export interface CreateInvoiceResponse {
  merchantCode?: string;
  reference?: string;
  paymentUrl?: string;
  statusCode?: string;
  statusMessage?: string;
}

export function loadDuitkuConfig(): DuitkuConfig {
  const environment = Deno.env.get("DUITKU_ENVIRONMENT") ?? "sandbox";
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("DUITKU_ENVIRONMENT must be sandbox or production");
  }
  const merchantCode = Deno.env.get("DUITKU_MERCHANT_CODE");
  const apiKey = Deno.env.get("DUITKU_API_KEY");
  if (!merchantCode || !apiKey) {
    throw new Error("Duitku server configuration is incomplete");
  }
  return { environment, merchantCode, apiKey };
}

export function createInvoiceEndpoint(environment: DuitkuEnvironment): string {
  return environment === "sandbox"
    ? "https://api-sandbox.duitku.com/api/merchant/createInvoice"
    : "https://api-prod.duitku.com/api/merchant/createInvoice";
}

export async function createDuitkuInvoice(
  config: DuitkuConfig,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ httpStatus: number; body: CreateInvoiceResponse }> {
  const timestamp = Date.now().toString();
  const signature = await createInvoiceSignature(
    config.merchantCode,
    timestamp,
    config.apiKey,
  );

  const response = await fetchImpl(createInvoiceEndpoint(config.environment), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-duitku-timestamp": timestamp,
      "x-duitku-signature": signature,
      "x-duitku-merchantcode": config.merchantCode,
    },
    body: JSON.stringify(payload),
  });

  let body: CreateInvoiceResponse;
  try {
    body = await response.json() as CreateInvoiceResponse;
  } catch {
    body = {};
  }
  return { httpStatus: response.status, body };
}
