export type DuitkuEnvironment = "sandbox" | "production";

export interface DuitkuConfig {
  environment: DuitkuEnvironment;
  merchantCode: string;
  apiKey: string;
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

export function duitkuBaseUrl(environment: DuitkuEnvironment): string {
  return environment === "sandbox"
    ? "https://sandbox.duitku.com"
    : "https://passport.duitku.com";
}

/**
 * Provider HTTP calls should be added only with request/response fields confirmed
 * against the official POP contract. Never log API keys or signatures.
 */
