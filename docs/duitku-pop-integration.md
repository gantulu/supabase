# Duitku POP Integration Contract (Repository)

**Source of truth:** [Dokumentasi resmi Duitku POP Bahasa Indonesia](https://docs.duitku.com/pop/id/). Reviewed 27 October 2026.

This document maps the requested official documentation sections to the backend implementation. It records conflicts rather than guessing.

## Document sections reviewed

- [Pendahuluan](https://docs.duitku.com/pop/id/#pendahuluan), [Pratinjau](https://docs.duitku.com/pop/id/#pratinjau), [Langkah Integrasi](https://docs.duitku.com/pop/id/#langkah-integrasi), [Flowchart](https://docs.duitku.com/pop/id/#flowchart)
- [Browser Yang Kompatibel](https://docs.duitku.com/pop/id/#browser-yang-kompatibel), [Library](https://docs.duitku.com/pop/id/#library)
- [Integrasi Backend atau Server](https://docs.duitku.com/pop/id/#integrasi-backend-atau-server), [Create Invoice](https://docs.duitku.com/pop/id/#create-invoice), [Obyek JSON](https://docs.duitku.com/pop/id/#obyek-json), [Callback](https://docs.duitku.com/pop/id/#callback)
- [Integrasi Frontend atau View](https://docs.duitku.com/pop/id/#integrasi-frontend-atau-view), [Tinjauan Umum](https://docs.duitku.com/pop/id/#tinjauan-umum), [Duitku JS](https://docs.duitku.com/pop/id/#duitku-js), [JS Callback](https://docs.duitku.com/pop/id/#js-callback), [Window Redirection](https://docs.duitku.com/pop/id/#window-redirection), [Redirect](https://docs.duitku.com/pop/id/#redirect)
- [Payment Method](https://docs.duitku.com/pop/id/#payment-method), [Errors](https://docs.duitku.com/pop/id/#errors), [Respon HTTP](https://docs.duitku.com/pop/id/#respon-http), [Respon API](https://docs.duitku.com/pop/id/#respon-api)

## Official Create Invoice contract

- HTTP method: `POST`; content type: `application/json`.
- Sandbox endpoint: `https://api-sandbox.duitku.com/api/merchant/createInvoice`.
- Production endpoint: `https://api-prod.duitku.com/api/merchant/createInvoice`.
- Required headers: `x-duitku-timestamp` (Unix epoch milliseconds), `x-duitku-signature`, `x-duitku-merchantcode`, and `Content-Type: application/json`.
- Create Invoice signature: `HMAC_SHA256(merchantCode + timestamp, apiKey)`, lowercase hexadecimal. Legacy SHA-256-only signing is obsolete.
- Store `reference` and use `paymentUrl` only as a provider-returned URL. Expected response fields include `merchantCode`, `reference`, `paymentUrl`, `statusCode`, and `statusMessage`.
- Duitku documents that requests with the same order ID may return the same response for five minutes; simultaneous duplicate requests can return HTTP 409 or an amount mismatch. The backend must enforce idempotency and never change the amount under an existing merchant order ID.
- `itemDetails[].price` is an integer (no decimals); the sum of item detail prices must equal `paymentAmount`. Calculate amounts from trusted database prices, not client-supplied totals.
- `expiryPeriod` is expressed in minutes in the official example.

## Callback contract

- Duitku sends HTTP `POST` using `application/x-www-form-urlencoded`.
- The public callback endpoint must be reachable over HTTP/HTTPS and respond HTTP 200 after successfully processing the callback. Duitku documents retries when it does not receive HTTP 200, up to five attempts.
- Callback signature: `HMAC_SHA256(merchantCode + amount + merchantOrderId, apiKey)`, lowercase hexadecimal.
- Verify signature, configured merchant code, order ID, and exact amount against the stored payment before any state transition.
- Persist the callback idempotently before acknowledging it. Never treat browser JavaScript callback data as payment authority; use server callback for payment state.

### Explicit unresolved discrepancy: callback failure result code

The official callback parameter table lists `resultCode=00` as success and `01` as failed. The later “Errors → Respon API → Callback” table lists `00` as success and `02` as failed. The redirect table separately lists `00` success, `01` process, `02` canceled/failed. These callback descriptions conflict.

Implementation policy:
- `00` is the only callback success code consistent across the callback-specific descriptions.
- Do not finalize non-`00` callbacks as `failed` until Duitku confirms the callback result-code contract.
- Store unknown or conflicting results as `needs_review`; do not infer terminal status.
- The current callback handler validates the documented form encoding and signature but intentionally returns 503 because the durable callback RPC, amount check against stored records, and idempotent transition are not yet wired. This prevents falsely acknowledging an unpersisted callback.

## Frontend POP contract (documented for integration boundaries)

- The frontend obtains the Duitku reference from the backend, then calls `checkout.process(reference, options)` using the official environment's Duitku JS library.
- Sandbox library: `https://app-sandbox.duitku.com/lib/js/duitku.js`.
- Production library: `https://app-prod.duitku.com/lib/js/duitku.js`.
- `successEvent`, `pendingEvent`, `errorEvent`, and `closeEvent` are UI events only. They must not update authoritative order/payment status.
- Alternative: redirect the browser to the `paymentUrl` returned by Create Invoice. Optional language query: `lang=id`. Currency conversion parameters are estimates only; actual payment remains IDR.
- Payment method codes and availability depend on merchant configuration. Do not hard-code availability without verifying the merchant's enabled methods.

## Error handling

- HTTP 400: malformed/invalid request, including amount mismatch cases.
- HTTP 401: unauthorized.
- HTTP 404: endpoint/resource not found.
- HTTP 409: transaction with the same order ID still in progress.
- HTTP 500: provider internal error.
- Do not blindly retry invoice creation with a changed amount or generate a new order ID for a retry of the same checkout. Reconcile the existing order first.

## Repository implementation status

Implemented from the official contract:
- Exact sandbox/production Create Invoice API endpoints and HMAC-SHA256 request signature.
- Exact callback HMAC-SHA256 input formula and form-urlencoded parsing.
- Constant-time signature comparison.
- Signature unit tests.

Not yet enabled:
- Invoice creation orchestration with trusted price/stock lookup, order/payment persistence, and idempotency RPC.
- Callback amount reconciliation, durable callback recording, idempotent state transitions, and HTTP 200 acknowledgement.
- A confirmed callback failure result-code mapping. This is intentionally blocked on the official documentation conflict above.

No SQL in this repository has been applied to a Supabase database. No secrets, deployments, or live payments were changed or run.


## Expanded field contract (official reference)

Create Invoice required fields listed by Duitku:
- paymentAmount: integer amount in IDR.
- merchantOrderId: string up to 50 characters; use a unique merchant-generated ID.
- productDetails: string up to 255 characters.
- email: string up to 255 characters.
- callbackUrl and returnUrl: strings up to 255 characters.
- Required request headers are Content-Type, x-duitku-timestamp, x-duitku-signature, and x-duitku-merchantcode.
- expiryPeriod is measured in minutes; documented examples include 5, 10, and 60.
- itemDetails entries contain name (string up to 50), quantity (integer), and price (integer, no decimals). The documented item total must equal paymentAmount.
- Optional fields include additionalParam, merchantUserInfo, customerVaName, phoneNumber, itemDetails, customerDetail, expiryPeriod, paymentMethod, and creditCardDetail. Credit-card transactions require customerDetail and itemDetails; E-Commerce methods require customerVaName. Tokenization fields must not be enabled implicitly.
- The response includes merchantCode, reference, paymentUrl, statusCode, and statusMessage. Persist reference and only use the provider-returned paymentUrl.
- Duitku's docs state duplicate requests using the same order ID may return the same response for five minutes. Simultaneous requests can produce HTTP 409 or amount-mismatch errors. Never retry a changed amount with the same merchant order ID.

Customer and address objects:
- customerDetail may include firstName, lastName, email, phoneNumber, merchantCustomerId, billingAddress, and shippingAddress.
- Address may include firstName, lastName, address, city, postalCode, phone, and countryCode.
- Duitku describes countryCode as ISO 3166-1 alpha-3, while its examples use ID. Confirm strict country-code expectations with Duitku if needed.

Payment method codes listed in the documentation include VC (credit card), BC (BCA VA), M2 (Mandiri VA), I1 (BNI VA), BR (BRIVA), IR (Indomaret), OV (OVO), DA (DANA), SP (ShopeePay QRIS), NQ (Nobu QRIS), SQ (Nusapay QRIS), DN (Indodana), AT (Atome), JP (Jenius Pay), and T1/T2/T3 (Tokopedia). Availability depends on merchant configuration; this list is informational, not a guarantee that a method is enabled.

## Frontend, browser and return-page details

- Sandbox Duitku JS: https://app-sandbox.duitku.com/lib/js/duitku.js
- Production Duitku JS: https://app-prod.duitku.com/lib/js/duitku.js
- checkout.process accepts the Duitku reference and options including defaultLanguage (id or en), optional estimated currency (USD/EUR), and successEvent, pendingEvent, errorEvent, and closeEvent UI callbacks.
- JS callbacks are for customer-facing notification only and must not update authoritative payment state.
- Window redirection can use the paymentUrl returned by Create Invoice. The lang query can select id or en. Currency query parameters are estimates only; payment remains IDR.
- The returnUrl receives merchantOrderId, reference, and resultCode, but users can manually change URL parameters. Do not use these values to update authoritative payment state.
- The published compatibility list states web Chrome 26+, Firefox 29+, Internet Explorer 10+, Safari 6+; mobile Chrome 32+, Android 4.4+, Safari 8+. This vendor list does not replace current application testing.

## Callback retry and response contract

The callback endpoint must accept HTTP POST with application/x-www-form-urlencoded. Duitku says the callback URL must be publicly reachable over HTTP/HTTPS and documents retrying if HTTP 200 is not received, up to five attempts. Only acknowledge HTTP 200 after the verified callback is durably persisted and processed idempotently. The current handler intentionally fails closed with HTTP 503 until that persistence and exact amount reconciliation are implemented.
