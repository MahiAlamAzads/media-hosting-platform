import { prisma, type Prisma } from "@media/database";
import { AppError } from "../../shared/http.js";
import {
  createStripeCustomer,
  retrieveStripeCheckoutSession
} from "../payments/stripe-payg.service.js";

const consentVersion = "payg-card-on-file-v1";

export async function ensureStripeCustomer(input: {
  workspaceId: string;
  billingEmail?: string | null;
  workspaceName?: string | null;
}): Promise<{
  recordId: string;
  providerCustomerId: string;
}> {
  const existing = await prisma.billingProviderCustomer.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: input.workspaceId,
        provider: "STRIPE"
      }
    }
  });

  if (existing) {
    return {
      recordId: existing.id,
      providerCustomerId: existing.providerCustomerId
    };
  }

  const customer = await createStripeCustomer({
    workspaceId: input.workspaceId,
    email: input.billingEmail,
    name: input.workspaceName
  });

  if (!customer.id) {
    throw new AppError(
      502,
      "STRIPE_CUSTOMER_INVALID",
      "Stripe did not return a customer ID."
    );
  }

  const created = await prisma.billingProviderCustomer.create({
    data: {
      workspaceId: input.workspaceId,
      provider: "STRIPE",
      providerCustomerId: String(customer.id)
    }
  });

  return {
    recordId: created.id,
    providerCustomerId: created.providerCustomerId
  };
}

function cardPayload(paymentMethod: Record<string, any>) {
  const card = paymentMethod.card ?? {};
  const billing = paymentMethod.billing_details ?? {};

  return {
    brand: card.brand ? String(card.brand) : null,
    last4: card.last4 ? String(card.last4) : null,
    expMonth: Number.isInteger(card.exp_month)
      ? Number(card.exp_month)
      : null,
    expYear: Number.isInteger(card.exp_year)
      ? Number(card.exp_year)
      : null,
    cardholderName: billing.name ? String(billing.name) : null,
    billingEmail: billing.email ? String(billing.email) : null
  };
}

export async function syncStripeSetupSession(
  sessionId: string,
  expectedWorkspaceId?: string
): Promise<{
  workspaceId: string;
  paymentMethodId: string;
}> {
  const session = await retrieveStripeCheckoutSession(sessionId);

  if (
    session.mode !== "setup" ||
    session.status !== "complete"
  ) {
    throw new AppError(
      409,
      "CARD_SETUP_NOT_COMPLETE",
      "The saved-card setup is not complete."
    );
  }

  const workspaceId = String(
    session.metadata?.workspaceId ??
    session.setup_intent?.metadata?.workspaceId ??
    ""
  );

  if (!workspaceId) {
    throw new AppError(
      422,
      "CARD_SETUP_WORKSPACE_MISSING",
      "The saved-card setup does not identify a workspace."
    );
  }

  if (
    expectedWorkspaceId &&
    workspaceId !== expectedWorkspaceId
  ) {
    throw new AppError(
      403,
      "PAYMENT_METHOD_WORKSPACE_MISMATCH",
      "The saved payment method belongs to another workspace."
    );
  }

  const setupIntent =
    typeof session.setup_intent === "object"
      ? session.setup_intent
      : null;
  const paymentMethod =
    typeof setupIntent?.payment_method === "object"
      ? setupIntent.payment_method
      : null;

  if (!setupIntent?.id || !paymentMethod?.id) {
    throw new AppError(
      502,
      "CARD_SETUP_PAYMENT_METHOD_MISSING",
      "Stripe did not return the saved payment method."
    );
  }

  const providerCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (!providerCustomerId) {
    throw new AppError(
      502,
      "CARD_SETUP_CUSTOMER_MISSING",
      "Stripe did not return the customer."
    );
  }

  const result = await prisma.$transaction(async tx => {
    const customer = await tx.billingProviderCustomer.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: "STRIPE"
        }
      },
      create: {
        workspaceId,
        provider: "STRIPE",
        providerCustomerId: String(providerCustomerId)
      },
      update: {
        providerCustomerId: String(providerCustomerId)
      }
    });

    const existingProviderMethod = await tx.savedPaymentMethod.findUnique({
      where: {
        providerPaymentMethodId: String(paymentMethod.id)
      },
      select: { workspaceId: true }
    });

    if (
      existingProviderMethod &&
      existingProviderMethod.workspaceId !== workspaceId
    ) {
      throw new AppError(
        409,
        "PAYMENT_METHOD_ALREADY_ASSIGNED",
        "The gateway payment method is already assigned to another workspace."
      );
    }

    const existingCount = await tx.savedPaymentMethod.count({
      where: {
        workspaceId,
        status: "ACTIVE",
        removedAt: null
      }
    });

    const method = await tx.savedPaymentMethod.upsert({
      where: {
        providerPaymentMethodId: String(paymentMethod.id)
      },
      create: {
        workspaceId,
        providerCustomerRecordId: customer.id,
        provider: "STRIPE",
        providerPaymentMethodId: String(paymentMethod.id),
        ...cardPayload(paymentMethod),
        status: "ACTIVE",
        isDefault: existingCount === 0,
        consentVersion,
        consentAt: new Date()
      },
      update: {
        ...cardPayload(paymentMethod),
        status: "ACTIVE",
        removedAt: null,
        consentVersion,
        consentAt: new Date()
      }
    });

    if (existingCount === 0) {
      await tx.savedPaymentMethod.updateMany({
        where: {
          workspaceId,
          id: { not: method.id }
        },
        data: { isDefault: false }
      });
    }

    return method;
  });

  return {
    workspaceId,
    paymentMethodId: result.id
  };
}

export async function setDefaultPaymentMethod(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  paymentMethodId: string
): Promise<void> {
  const method = await tx.savedPaymentMethod.findFirst({
    where: {
      id: paymentMethodId,
      workspaceId,
      status: "ACTIVE",
      removedAt: null
    }
  });

  if (!method) {
    throw new AppError(
      404,
      "PAYMENT_METHOD_NOT_FOUND",
      "Saved payment method was not found."
    );
  }

  await tx.savedPaymentMethod.updateMany({
    where: { workspaceId },
    data: { isDefault: false }
  });
  await tx.savedPaymentMethod.update({
    where: { id: method.id },
    data: { isDefault: true }
  });

  await tx.paygPolicy.updateMany({
    where: { workspaceId },
    data: { defaultPaymentMethodId: method.id }
  });
}
