import { type Prisma } from "@media/database";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/http.js";
import { createInvoiceNumber } from "../payments/payment.utils.js";
import {
  getPeriodBounds,
  getSubscriptionCommitmentBounds,
  subscriptionTermToInterval,
} from "./billing.utils.js";
import type {
  BillingCurrencyName,
  SubscriptionTermName,
} from "./billing.types.js";

export type RevenueModelName =
  "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";

export function minimumTopupMinor(currency: BillingCurrencyName): bigint {
  return currency === "BDT"
    ? BigInt(env.PAYG_MINIMUM_TOPUP_BDT_MINOR)
    : BigInt(env.PAYG_MINIMUM_TOPUP_USD_MINOR);
}

export function defaultLowBalanceMinor(currency: BillingCurrencyName): bigint {
  return currency === "BDT"
    ? BigInt(env.PAYG_LOW_BALANCE_BDT_MINOR)
    : BigInt(env.PAYG_LOW_BALANCE_USD_MINOR);
}

export async function ensurePrepaidWalletInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  currency: BillingCurrencyName,
) {
  const existing = await tx.prepaidWallet.findUnique({
    where: { workspaceId },
  });

  if (existing && existing.currency !== currency) {
    if (existing.balanceMinor !== 0n || existing.reservedMinor !== 0n) {
      throw new AppError(
        409,
        "WALLET_CURRENCY_LOCKED",
        "Wallet currency cannot change while it has a balance or reserved funds.",
      );
    }

    return tx.prepaidWallet.update({
      where: { id: existing.id },
      data: {
        currency,
        lowBalanceThresholdMinor: defaultLowBalanceMinor(currency),
      },
    });
  }

  if (existing) return existing;

  return tx.prepaidWallet.create({
    data: {
      workspaceId,
      currency,
      lowBalanceThresholdMinor: defaultLowBalanceMinor(currency),
    },
  });
}

export async function createWalletTopupInvoice(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    requestedById: string;
    currency: BillingCurrencyName;
    amountMinor: bigint;
  },
) {
  const subscription = await tx.workspaceSubscription.findUnique({
    where: { workspaceId: input.workspaceId },
    include: {
      planVersion: {
        include: {
          plan: true,
          entitlements: {
            where: { metric: "STORAGE_BYTES" },
            take: 1,
          },
        },
      },
    },
  });

  if (!subscription) {
    throw new AppError(
      503,
      "BILLING_NOT_CONFIGURED",
      "Workspace billing is not configured.",
    );
  }

  if (subscription.currency !== input.currency) {
    throw new AppError(
      409,
      "WALLET_CURRENCY_MISMATCH",
      "Top-up currency must match the workspace billing currency.",
    );
  }

  const minimum = minimumTopupMinor(input.currency);
  if (input.amountMinor < minimum) {
    throw new AppError(
      422,
      "TOPUP_BELOW_MINIMUM",
      "The top-up amount is below the minimum.",
      {
        minimumAmountMinor: minimum.toString(),
        currency: input.currency,
      },
    );
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "Workspace"
    WHERE "id" = ${input.workspaceId}
    FOR UPDATE
  `;

  await ensurePrepaidWalletInTransaction(tx, input.workspaceId, input.currency);

  const now = new Date();
  const dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return tx.billingInvoice.create({
    data: {
      number: createInvoiceNumber(),
      kind: "WALLET_TOPUP",
      workspaceId: input.workspaceId,
      requestedById: input.requestedById,
      planVersionId: subscription.planVersionId,
      currency: input.currency,
      interval: subscription.interval,
      revenueModel: "PREPAID_PAYG",
      subscriptionTerm: subscription.subscriptionTerm,
      amountMinor: input.amountMinor,
      periodStart: now,
      periodEnd: dueAt,
      dueAt,
      snapshot: {
        kind: "WALLET_TOPUP",
        revenueModel: "PREPAID_PAYG",
        amountMinor: input.amountMinor.toString(),
        currency: input.currency,
        planCode: subscription.planVersion.plan.code,
        planName: subscription.planVersion.plan.name,
      },
    },
  });
}

export async function createSubscriptionOfferInvoice(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    requestedById: string;
    planCode: string;
    currency: BillingCurrencyName;
    term: SubscriptionTermName;
  },
) {
  const version = await tx.planVersion.findFirst({
    where: {
      publishedAt: { not: null },
      retiredAt: null,
      plan: {
        code: input.planCode,
        isActive: true,
        isPublic: true,
      },
    },
    orderBy: { version: "desc" },
    include: {
      plan: true,
      entitlements: {
        where: { metric: "STORAGE_BYTES" },
        take: 1,
      },
    },
  });

  const offer = version
    ? await tx.planOffer.findUnique({
        where: {
          planVersionId_currency_term: {
            planVersionId: version.id,
            currency: input.currency,
            term: input.term,
          },
        },
        include: {
          planVersion: {
            include: {
              plan: true,
              entitlements: {
                where: { metric: "STORAGE_BYTES" },
                take: 1,
              },
            },
          },
        },
      })
    : null;

  if (!offer || !offer.isActive || !offer.isPublic) {
    throw new AppError(
      404,
      "SUBSCRIPTION_OFFER_NOT_FOUND",
      "The selected subscription offer is unavailable.",
    );
  }

  const now = new Date();
  const current = await tx.subscriptionChange.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] },
    },
    select: { id: true },
  });

  if (current.length > 0) {
    const ids = current.map((item) => item.id);
    await tx.subscriptionChange.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "CANCELLED",
        reviewedAt: now,
        note: "Superseded by a newer subscription offer.",
      },
    });
    await tx.billingInvoice.updateMany({
      where: {
        subscriptionChangeId: { in: ids },
        status: "OPEN",
      },
      data: { status: "VOID", voidedAt: now },
    });
  }

  const interval = subscriptionTermToInterval(input.term);
  const commitment = getSubscriptionCommitmentBounds(now, input.term);
  const paymentRequired = offer.amountMinor > 0n;

  const change = await tx.subscriptionChange.create({
    data: {
      workspaceId: input.workspaceId,
      requestedById: input.requestedById,
      requestedPlanVersionId: offer.planVersionId,
      currency: input.currency,
      interval,
      revenueModel: "SUBSCRIPTION",
      subscriptionTerm: input.term,
      status: paymentRequired ? "PAYMENT_PENDING" : "PENDING",
    },
  });

  const invoice = paymentRequired
    ? await tx.billingInvoice.create({
        data: {
          number: createInvoiceNumber(),
          kind: "PLAN_CHANGE",
          workspaceId: input.workspaceId,
          subscriptionChangeId: change.id,
          requestedById: input.requestedById,
          planVersionId: offer.planVersionId,
          currency: input.currency,
          interval,
          revenueModel: "SUBSCRIPTION",
          subscriptionTerm: input.term,
          amountMinor: offer.amountMinor,
          periodStart: commitment.start,
          periodEnd: commitment.end,
          dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          snapshot: {
            kind: "PLAN_CHANGE",
            revenueModel: "SUBSCRIPTION",
            subscriptionTerm: input.term,
            planCode: offer.planVersion.plan.code,
            planName: offer.planVersion.plan.name,
            planVersion: offer.planVersion.version,
            amountMinor: offer.amountMinor.toString(),
            currency: input.currency,
          },
        },
      })
    : null;

  if (!paymentRequired) {
    const usagePeriod = getPeriodBounds(now, "MONTHLY");

    const storageLimit = offer.planVersion.entitlements[0]?.includedAmount;

    await tx.workspaceSubscription.update({
      where: { workspaceId: input.workspaceId },
      data: {
        planVersionId: offer.planVersionId,
        currency: input.currency,
        interval,
        revenueModel: "SUBSCRIPTION",
        subscriptionTerm: input.term,
        commitmentEndsAt: null,
        status: "ACTIVE",
        periodStart: usagePeriod.start,
        periodEnd: usagePeriod.end,
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
      },
    });

    await tx.paygPolicy.updateMany({
      where: { workspaceId: input.workspaceId },
      data: {
        status: "DISABLED",
        pausedAt: null,
        pauseReason: null,
      },
    });

    await tx.billingPreference.upsert({
      where: { workspaceId: input.workspaceId },
      create: {
        workspaceId: input.workspaceId,
        preferredCurrency: input.currency,
        preferredInterval: interval,
        revenueModel: "SUBSCRIPTION",
        subscriptionTerm: input.term,
      },
      update: {
        preferredCurrency: input.currency,
        preferredInterval: interval,
        revenueModel: "SUBSCRIPTION",
        subscriptionTerm: input.term,
      },
    });

    await tx.subscriptionChange.update({
      where: { id: change.id },
      data: {
        status: "APPLIED",
        effectiveAt: now,
        reviewedAt: now,
        note: "Free subscription applied immediately.",
      },
    });

    if (storageLimit !== undefined) {
      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageLimitBytes" = GREATEST(
          "storageUsedBytes",
          ${storageLimit}
        )
        WHERE "id" = ${input.workspaceId}
      `;
    }
  }

  return { offer, change, invoice, paymentRequired };
}

export async function activatePrepaidRevenueModel(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    userId: string;
    currency: BillingCurrencyName;
    enabledMetrics: Array<{
      metric:
        | "STORAGE_BYTES"
        | "DELIVERY_BYTES"
        | "UPLOAD_BYTES"
        | "API_REQUESTS"
        | "IMAGE_TRANSFORMATIONS"
        | "VIDEO_PROCESSING_SECONDS"
        | "PROCESSING_CPU_MILLISECONDS";
      metricSpendCapMinor?: bigint | null;
    }>;
  },
) {
  const wallet = await ensurePrepaidWalletInTransaction(
    tx,
    input.workspaceId,
    input.currency,
  );

  const minimum = minimumTopupMinor(input.currency);
  const available = wallet.balanceMinor - wallet.reservedMinor;

  if (wallet.status !== "ACTIVE" || available < minimum) {
    throw new AppError(
      402,
      "WALLET_TOPUP_REQUIRED",
      "Top up the prepaid wallet before activating Pay As You Go.",
      {
        minimumTopupMinor: minimum.toString(),
        availableBalanceMinor: available.toString(),
        currency: input.currency,
      },
    );
  }

  const policy = await tx.paygPolicy.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      status: "ACTIVE",
      currency: input.currency,
      monthlySpendCapMinor: wallet.balanceMinor,
      chargeThresholdMinor: minimum,
      consentVersion: "prepaid-payg-v1",
      consentAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      currency: input.currency,
      monthlySpendCapMinor: wallet.balanceMinor,
      chargeThresholdMinor: minimum,
      defaultPaymentMethodId: null,
      consentVersion: "prepaid-payg-v1",
      consentAt: new Date(),
      pausedAt: null,
      pauseReason: null,
    },
  });

  await tx.paygMetricSetting.deleteMany({
    where: { policyId: policy.id },
  });

  if (input.enabledMetrics.length > 0) {
    await tx.paygMetricSetting.createMany({
      data: input.enabledMetrics.map((item) => ({
        policyId: policy.id,
        metric: item.metric,
        enabled: true,
        metricSpendCapMinor: item.metricSpendCapMinor ?? null,
      })),
    });
  }

  await tx.billingPreference.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      preferredCurrency: input.currency,
      preferredInterval: "MONTHLY",
      revenueModel: "PREPAID_PAYG",
      subscriptionTerm: "FREE",
    },
    update: {
      preferredCurrency: input.currency,
      revenueModel: "PREPAID_PAYG",
      subscriptionTerm: "FREE",
    },
  });

  await tx.workspaceSubscription.update({
    where: { workspaceId: input.workspaceId },
    data: {
      revenueModel: "PREPAID_PAYG",
      subscriptionTerm: "FREE",
      commitmentEndsAt: null,
    },
  });

  await tx.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.userId,
      action: "billing.revenue_model_changed",
      entityType: "BillingPreference",
      entityId: input.workspaceId,
      metadata: {
        revenueModel: "PREPAID_PAYG",
        walletBalanceMinor: wallet.balanceMinor.toString(),
        enabledMetrics: input.enabledMetrics.map((item) => item.metric),
      },
    },
  });

  return { wallet, policy };
}

export async function activateSubscriptionRevenueModel(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    userId: string;
  },
) {
  const preference = await tx.billingPreference.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      revenueModel: "SUBSCRIPTION",
      subscriptionTerm: "FREE",
    },
    update: { revenueModel: "SUBSCRIPTION" },
  });

  await tx.workspaceSubscription.update({
    where: { workspaceId: input.workspaceId },
    data: { revenueModel: "SUBSCRIPTION" },
  });

  await tx.paygPolicy.updateMany({
    where: { workspaceId: input.workspaceId },
    data: {
      status: "DISABLED",
      pausedAt: null,
      pauseReason: null,
    },
  });

  await tx.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.userId,
      action: "billing.revenue_model_changed",
      entityType: "BillingPreference",
      entityId: input.workspaceId,
      metadata: { revenueModel: "SUBSCRIPTION" },
    },
  });

  return preference;
}
