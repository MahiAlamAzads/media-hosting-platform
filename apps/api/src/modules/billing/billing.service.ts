import { prisma, type Prisma } from "@media/database";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/http.js";
import { cacheDelete, cacheGetOrSet } from "../../infrastructure/cache.js";
import type {
  BillingCurrencyName,
  BillingIntervalName,
  EntitlementValue,
  UsageMetricName,
} from "./billing.types.js";
import { formatMoneyMinor, getPeriodBounds } from "./billing.utils.js";

export type BillingTransaction = Prisma.TransactionClient;

export async function createFreeBillingForWorkspace(
  tx: BillingTransaction,
  input: {
    workspaceId: string;
    billingEmail?: string;
    currency?: BillingCurrencyName;
  },
): Promise<void> {
  const freeVersion = await tx.planVersion.findFirst({
    where: {
      plan: { code: "FREE", isActive: true },
      publishedAt: { not: null },
      retiredAt: null,
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!freeVersion) {
    throw new AppError(
      503,
      "BILLING_NOT_CONFIGURED",
      "The default plan is not configured.",
    );
  }

  const currency = input.currency ?? "BDT";
  const period = getPeriodBounds(new Date(), "MONTHLY");

  await tx.workspaceSubscription.create({
    data: {
      workspaceId: input.workspaceId,
      planVersionId: freeVersion.id,
      status: "ACTIVE",
      currency,
      interval: "MONTHLY",
      revenueModel: "SUBSCRIPTION",
      subscriptionTerm: "FREE",
      commitmentEndsAt: null,
      periodStart: period.start,
      periodEnd: period.end,
    },
  });

  await tx.billingPreference.create({
    data: {
      workspaceId: input.workspaceId,
      preferredCurrency: currency,
      preferredInterval: "MONTHLY",
      revenueModel: "SUBSCRIPTION",
      subscriptionTerm: "FREE",
      billingEmail: input.billingEmail,
    },
  });

  await tx.prepaidWallet.create({
    data: {
      workspaceId: input.workspaceId,
      currency,
      lowBalanceThresholdMinor:
        currency === "BDT"
          ? BigInt(env.PAYG_LOW_BALANCE_BDT_MINOR)
          : BigInt(env.PAYG_LOW_BALANCE_USD_MINOR),
    },
  });
}

export async function loadEntitlementsInTransaction(
  tx: BillingTransaction,
  workspaceId: string,
): Promise<{
  subscriptionId: string;
  planCode: string;
  currency: BillingCurrencyName;
  periodStart: Date;
  periodEnd: Date;
  values: Map<UsageMetricName, EntitlementValue>;
}> {
  const subscription = await tx.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: {
      planVersion: {
        include: {
          plan: true,
          entitlements: true,
        },
      },
    },
  });

  if (
    !subscription ||
    !["ACTIVE", "TRIALING", "GRACE_PERIOD"].includes(subscription.status)
  ) {
    throw new AppError(
      402,
      "SUBSCRIPTION_INACTIVE",
      "The workspace subscription is not active.",
    );
  }

  const values = new Map<UsageMetricName, EntitlementValue>();

  for (const entitlement of subscription.planVersion.entitlements) {
    values.set(entitlement.metric, {
      metric: entitlement.metric,
      includedAmount: entitlement.includedAmount,
      hardLimit: entitlement.hardLimit,
      overageAllowed: entitlement.overageAllowed,
      overageUnit: entitlement.overageUnit,
      overageBdtMinor: entitlement.overageBdtMinor,
      overageUsdMinor: entitlement.overageUsdMinor,
    });
  }

  return {
    subscriptionId: subscription.id,
    planCode: subscription.planVersion.plan.code,
    currency: subscription.currency,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
    values,
  };
}

export function requireEntitlement(
  values: Map<UsageMetricName, EntitlementValue>,
  metric: UsageMetricName,
): EntitlementValue {
  const entitlement = values.get(metric);

  if (!entitlement) {
    throw new AppError(
      503,
      "ENTITLEMENT_NOT_CONFIGURED",
      `Plan entitlement is missing for ${metric}.`,
    );
  }

  return entitlement;
}

async function loadPublicPricing(currency: BillingCurrencyName) {
  const plans = await prisma.plan.findMany({
    where: {
      isPublic: true,
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      versions: {
        where: {
          publishedAt: { not: null },
          retiredAt: null,
        },
        orderBy: { version: "desc" },
        take: 1,
        include: {
          prices: {
            where: { currency, isActive: true },
          },
          offers: {
            where: {
              currency,
              isActive: true,
              isPublic: true,
            },
            orderBy: { amountMinor: "asc" },
          },
          entitlements: {
            orderBy: { metric: "asc" },
          },
        },
      },
    },
  });

  return plans.flatMap((plan) => {
    const version = plan.versions[0];
    if (!version) return [];

    const price = (interval: BillingIntervalName) => {
      const item = version.prices.find((value) => value.interval === interval);
      return item
        ? {
            amountMinor: item.amountMinor.toString(),
            formatted: formatMoneyMinor(item.amountMinor, currency),
          }
        : null;
    };

    return [
      {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        sortOrder: plan.sortOrder,
        versionId: version.id,
        version: version.version,
        monthly: price("MONTHLY"),
        yearly: price("YEARLY"),
        offers: version.offers.map((item) => ({
          id: item.id,
          term: item.term,
          amountMinor: item.amountMinor.toString(),
          formatted: formatMoneyMinor(item.amountMinor, currency),
        })),
        entitlements: version.entitlements.map((item) => ({
          metric: item.metric,
          includedAmount: item.includedAmount.toString(),
          hardLimit: item.hardLimit,
          overageAllowed: item.overageAllowed,
          overageUnit: item.overageUnit?.toString() ?? null,
          overageBdtMinor: item.overageBdtMinor?.toString() ?? null,
          overageUsdMinor: item.overageUsdMinor?.toString() ?? null,
        })),
      },
    ];
  });
}

export async function getPublicPricing(currency: BillingCurrencyName) {
  return cacheGetOrSet(
    "public-pricing",
    currency,
    env.REDIS_PRICING_TTL_SECONDS,
    () => loadPublicPricing(currency),
  );
}

export async function invalidatePublicPricingCache(): Promise<void> {
  await cacheDelete("public-pricing", "BDT", "USD");
}
