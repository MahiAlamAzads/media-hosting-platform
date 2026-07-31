import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/http.js";

type StripeObject = Record<string, any>;

function assertStripeEnabled(): void {
  if (!env.PAYG_ENABLED || !env.STRIPE_PAYG_ENABLED || !env.STRIPE_SECRET_KEY) {
    throw new AppError(
      503,
      "STRIPE_PAYG_DISABLED",
      "Stripe card-on-file PAYG is not configured.",
    );
  }
}

async function stripeRequest(
  path: string,
  init: {
    method?: "GET" | "POST" | "DELETE";
    body?: URLSearchParams;
  } = {},
): Promise<StripeObject> {
  assertStripeEnabled();

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(init.body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: init.body,
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json()) as StripeObject;

  if (!response.ok) {
    throw new AppError(
      502,
      "STRIPE_REQUEST_FAILED",
      payload?.error?.message ?? "Stripe request failed.",
      {
        stripeType: payload?.error?.type ?? null,
        stripeCode: payload?.error?.code ?? null,
      },
    );
  }

  return payload;
}

export async function createStripeCustomer(input: {
  email?: string | null;
  name?: string | null;
  workspaceId: string;
}): Promise<StripeObject> {
  const body = new URLSearchParams();
  if (input.email) body.set("email", input.email);
  if (input.name) body.set("name", input.name);
  body.set("metadata[workspaceId]", input.workspaceId);

  return stripeRequest("/customers", { method: "POST", body });
}

export async function createStripeSetupCheckout(input: {
  customerId: string;
  workspaceId: string;
}): Promise<StripeObject> {
  const body = new URLSearchParams();
  body.set("mode", "setup");
  body.set("customer", input.customerId);
  body.set("payment_method_types[0]", "card");
  body.set(
    "success_url",
    `${env.WEB_URL}/dashboard/billing/pay-as-you-go?card=success&session_id={CHECKOUT_SESSION_ID}`,
  );
  body.set(
    "cancel_url",
    `${env.WEB_URL}/dashboard/billing/pay-as-you-go?card=cancelled`,
  );
  body.set("metadata[workspaceId]", input.workspaceId);
  body.set("setup_intent_data[usage]", "off_session");
  body.set("setup_intent_data[metadata][workspaceId]", input.workspaceId);

  return stripeRequest("/checkout/sessions", {
    method: "POST",
    body,
  });
}

export async function retrieveStripeCheckoutSession(
  sessionId: string,
): Promise<StripeObject> {
  return stripeRequest(
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=setup_intent&expand[]=setup_intent.payment_method`,
  );
}

export async function retrieveStripeSetupIntent(
  setupIntentId: string,
): Promise<StripeObject> {
  return stripeRequest(
    `/setup_intents/${encodeURIComponent(setupIntentId)}?expand[]=payment_method`,
  );
}

export async function detachStripePaymentMethod(
  paymentMethodId: string,
): Promise<StripeObject> {
  return stripeRequest(
    `/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`,
    { method: "POST", body: new URLSearchParams() },
  );
}

export async function chargeStripeOffSession(input: {
  customerId: string;
  paymentMethodId: string;
  amountMinor: bigint;
  currency: "BDT" | "USD";
  workspaceId: string;
  chargeAttemptId: string;
}): Promise<StripeObject> {
  const body = new URLSearchParams();
  body.set("amount", input.amountMinor.toString());
  body.set("currency", input.currency.toLowerCase());
  body.set("customer", input.customerId);
  body.set("payment_method", input.paymentMethodId);
  body.set("confirm", "true");
  body.set("off_session", "true");
  body.set("description", "Media Platform pay-as-you-go usage");
  body.set("metadata[workspaceId]", input.workspaceId);
  body.set("metadata[paygChargeAttemptId]", input.chargeAttemptId);

  return stripeRequest("/payment_intents", {
    method: "POST",
    body,
  });
}

export function verifyStripeWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): void {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(
      503,
      "STRIPE_WEBHOOK_NOT_CONFIGURED",
      "Stripe webhook verification is not configured.",
    );
  }

  if (!signatureHeader) {
    throw new AppError(
      400,
      "STRIPE_SIGNATURE_MISSING",
      "Stripe signature header is missing.",
    );
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    throw new AppError(
      400,
      "STRIPE_SIGNATURE_INVALID",
      "Stripe signature header is invalid.",
    );
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));

  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new AppError(
      400,
      "STRIPE_SIGNATURE_EXPIRED",
      "Stripe webhook timestamp is outside the allowed window.",
    );
  }

  const expected = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");

  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AppError(
      400,
      "STRIPE_SIGNATURE_INVALID",
      "Stripe webhook signature is invalid.",
    );
  }
}
