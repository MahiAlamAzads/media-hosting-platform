import { env } from "../../config/env.js";
import { AppError } from "../../shared/http.js";
import type { GatewayValidationRecord } from "./payment.types.js";
import { moneyMinorToDecimal } from "./payment.utils.js";

function baseUrl(): string {
  return env.SSLCOMMERZ_SANDBOX
    ? "https://sandbox.sslcommerz.com"
    : "https://securepay.sslcommerz.com";
}

function credentials(): {
  storeId: string;
  storePassword: string;
} {
  if (
    !env.SSLCOMMERZ_ENABLED ||
    !env.SSLCOMMERZ_STORE_ID ||
    !env.SSLCOMMERZ_STORE_PASSWORD
  ) {
    throw new AppError(
      503,
      "SSLCOMMERZ_NOT_CONFIGURED",
      "SSLCOMMERZ payment is not configured."
    );
  }

  return {
    storeId: env.SSLCOMMERZ_STORE_ID,
    storePassword: env.SSLCOMMERZ_STORE_PASSWORD
  };
}

function gatewayText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

async function gatewayFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new AppError(
      502,
      "PAYMENT_GATEWAY_UNAVAILABLE",
      "SSLCOMMERZ could not be reached.",
      {
        cause: error instanceof Error ? error.message : "Network request failed."
      }
    );
  }
}

async function parseJsonResponse(
  response: Response
): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);

  if (!response.ok || !body || typeof body !== "object") {
    throw new AppError(
      502,
      "PAYMENT_GATEWAY_ERROR",
      "SSLCOMMERZ returned an invalid response."
    );
  }

  return body as Record<string, unknown>;
}

export async function initiateSslcommerz(input: {
  transactionId: string;
  invoiceId: string;
  workspaceId: string;
  subscriptionChangeId?: string | null;
  amountMinor: bigint;
  currency: "BDT" | "USD";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine1: string;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country: string;
  productName: string;
}) {
  if (input.currency === "BDT" && input.amountMinor < 1000n) {
    throw new AppError(
      422,
      "PAYMENT_AMOUNT_TOO_SMALL",
      "SSLCOMMERZ requires a minimum BDT transaction amount of ৳10."
    );
  }

  if (input.customerEmail.length > 50) {
    throw new AppError(
      422,
      "BILLING_EMAIL_TOO_LONG",
      "SSLCOMMERZ requires a billing email no longer than 50 characters."
    );
  }

  if (input.customerPhone.length > 20) {
    throw new AppError(
      422,
      "BILLING_PHONE_TOO_LONG",
      "SSLCOMMERZ requires a billing phone no longer than 20 characters."
    );
  }

  const { storeId, storePassword } = credentials();
  const callbackBase =
    `${env.API_PUBLIC_URL}/api/v1/payment-callbacks/sslcommerz`;
  const amount = moneyMinorToDecimal(input.amountMinor);
  const form = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: amount,
    currency: input.currency,
    tran_id: input.transactionId,
    success_url: `${callbackBase}/success`,
    fail_url: `${callbackBase}/fail`,
    cancel_url: `${callbackBase}/cancel`,
    ipn_url: `${callbackBase}/ipn`,
    cus_name: gatewayText(input.customerName, 50),
    cus_email: input.customerEmail,
    cus_add1: gatewayText(input.addressLine1, 50),
    cus_city: gatewayText(input.city, 50),
    cus_state: gatewayText(input.region ?? input.city, 50),
    cus_postcode: gatewayText(input.postalCode ?? "0000", 30),
    cus_country: gatewayText(input.country, 50),
    cus_phone: input.customerPhone,
    shipping_method: "NO",
    product_name: gatewayText(input.productName, 255),
    product_category: "Software Subscription",
    product_profile: "non-physical-goods",
    product_amount: amount,
    value_a: input.invoiceId,
    value_b: input.workspaceId,
    value_c: input.subscriptionChangeId ?? "",
    value_d: input.currency
  });

  const response = await gatewayFetch(
    `${baseUrl()}/gwprocess/v4/api.php`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form
    }
  );
  const data = await parseJsonResponse(response);

  if (
    data.status !== "SUCCESS" ||
    typeof data.GatewayPageURL !== "string"
  ) {
    throw new AppError(
      502,
      "PAYMENT_SESSION_FAILED",
      typeof data.failedreason === "string"
        ? data.failedreason
        : "SSLCOMMERZ could not create a payment session."
    );
  }

  return {
    gatewayPageUrl: data.GatewayPageURL,
    sessionKey:
      typeof data.sessionkey === "string"
        ? data.sessionkey
        : null,
    raw: data
  };
}

export async function validateSslcommerzPayment(
  validationId: string
): Promise<GatewayValidationRecord> {
  const { storeId, storePassword } = credentials();
  const query = new URLSearchParams({
    val_id: validationId,
    store_id: storeId,
    store_passwd: storePassword,
    format: "json"
  });
  const response = await gatewayFetch(
    `${baseUrl()}/validator/api/validationserverAPI.php?${query}`
  );
  return await parseJsonResponse(response) as GatewayValidationRecord;
}

export async function querySslcommerzTransaction(
  transactionId: string
): Promise<GatewayValidationRecord[]> {
  const { storeId, storePassword } = credentials();
  const query = new URLSearchParams({
    tran_id: transactionId,
    store_id: storeId,
    store_passwd: storePassword,
    format: "json"
  });
  const response = await gatewayFetch(
    `${baseUrl()}/validator/api/merchantTransIDvalidationAPI.php?${query}`
  );
  const data = await parseJsonResponse(response);
  return Array.isArray(data.element)
    ? data.element as GatewayValidationRecord[]
    : [];
}
