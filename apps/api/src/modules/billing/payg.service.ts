import { prisma, type Prisma } from "@media/database";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/http.js";
import type {
  BillingCurrencyName,
  EntitlementValue,
  UsageMetricName,
} from "./billing.types.js";

export const paygEligibleMetrics = [
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "UPLOAD_BYTES",
  "API_REQUESTS",
  "IMAGE_TRANSFORMATIONS",
  "VIDEO_PROCESSING_SECONDS",
  "PROCESSING_CPU_MILLISECONDS",
] as const satisfies readonly UsageMetricName[];

export type PaygEligibleMetric = (typeof paygEligibleMetrics)[number];

export type PaygCoverage = {
  metric: PaygEligibleMetric;
  amountMinor: bigint;
  currency: BillingCurrencyName;
  periodStart: Date;
  periodEnd: Date;
  operationKey: string;
};

function ceilDiv(value: bigint, divisor: bigint): bigint {
  if (value <= 0n) return 0n;
  return (value + divisor - 1n) / divisor;
}

export function incrementalOverageAmount(input: {
  current: bigint;
  requested: bigint;
  limit: bigint;
  unitSize: bigint;
  unitPriceMinor: bigint;
}): {
  billableUnits: bigint;
  amountMinor: bigint;
} {
  if (input.unitSize <= 0n || input.unitPriceMinor < 0n) {
    throw new AppError(
      503,
      "OVERAGE_PRICE_INVALID",
      "The overage price configuration is invalid.",
    );
  }

  const before = ceilDiv(
    input.current > input.limit ? input.current - input.limit : 0n,
    input.unitSize,
  );
  const next = input.current + input.requested;
  const after = ceilDiv(
    next > input.limit ? next - input.limit : 0n,
    input.unitSize,
  );
  const billableUnits = after > before ? after - before : 0n;

  return {
    billableUnits,
    amountMinor: billableUnits * input.unitPriceMinor,
  };
}

function unitPrice(
  entitlement: EntitlementValue,
  currency: BillingCurrencyName,
): bigint | null {
  return currency === "BDT"
    ? (entitlement.overageBdtMinor ?? null)
    : (entitlement.overageUsdMinor ?? null);
}

export function isPaygEligibleMetric(
  metric: UsageMetricName,
): metric is PaygEligibleMetric {
  return (paygEligibleMetrics as readonly string[]).includes(metric);
}

async function lockWallet(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id"
    FROM "PrepaidWallet"
    WHERE "workspaceId" = ${workspaceId}
    FOR UPDATE
  `;
}

async function releaseWalletReservation(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  amountMinor: bigint,
): Promise<void> {
  if (amountMinor <= 0n) return;

  await tx.$executeRaw`
    UPDATE "PrepaidWallet"
    SET
      "reservedMinor" = GREATEST(
        0,
        "reservedMinor" - ${amountMinor}
      ),
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workspaceId" = ${workspaceId}
  `;
}

export async function ensurePaygCoverageInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    metric: UsageMetricName;
    current: bigint;
    requested: bigint;
    limit: bigint;
    hardLimit: boolean;
    entitlement: EntitlementValue;
    currency: BillingCurrencyName;
    periodStart: Date;
    periodEnd: Date;
    operationKey: string;
  },
): Promise<PaygCoverage | null> {
  if (input.requested <= 0n || !isPaygEligibleMetric(input.metric)) {
    return null;
  }

  const [preference, policy] = await Promise.all([
    tx.billingPreference.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { revenueModel: true },
    }),
    tx.paygPolicy.findUnique({
      where: { workspaceId: input.workspaceId },
      include: {
        defaultPaymentMethod: true,
        metrics: {
          where: {
            metric: input.metric,
            enabled: true,
          },
        },
      },
    }),
  ]);

  const prepaid = preference?.revenueModel === "PREPAID_PAYG";
  const effectiveLimit = 0n;
  const next = input.current + input.requested;

  if (!prepaid) {
    if (!input.hardLimit || next <= input.limit) {
      return null;
    }

    throw new AppError(
      413,
      "PLAN_LIMIT_EXCEEDED",
      `${input.metric} exceeds the current subscription limit.`,
      {
        metric: input.metric,
        limit: input.limit.toString(),
        current: input.current.toString(),
        requested: input.requested.toString(),
        prepaidPaygAvailable: true,
        action: "TOP_UP_AND_ENABLE_PREPAID_PAYG",
      },
    );
  }

  if (!env.PAYG_ENABLED) {
    throw new AppError(
      413,
      "PLAN_LIMIT_EXCEEDED",
      `${input.metric} exceeds the current plan limit.`,
      {
        metric: input.metric,
        limit: effectiveLimit.toString(),
        current: input.current.toString(),
        requested: input.requested.toString(),
        paygAvailable: false,
      },
    );
  }

  const unitSize = input.entitlement.overageUnit;
  const price = unitPrice(input.entitlement, input.currency);

  if (!unitSize || unitSize <= 0n || price === null || price < 0n) {
    throw new AppError(
      413,
      "PLAN_LIMIT_EXCEEDED",
      `${input.metric} has no active PAYG price.`,
      {
        metric: input.metric,
        paygAvailable: false,
      },
    );
  }

  const metricPolicy = policy?.metrics[0];

  if (
    !policy ||
    policy.status !== "ACTIVE" ||
    policy.currency !== input.currency ||
    !metricPolicy
  ) {
    throw new AppError(
      prepaid ? 402 : 413,
      prepaid ? "PREPAID_PAYG_NOT_ACTIVE" : "PLAN_LIMIT_EXCEEDED",
      prepaid
        ? "Activate prepaid Pay As You Go after topping up the wallet."
        : `${input.metric} exceeds the current plan limit.`,
      {
        metric: input.metric,
        paygAvailable: true,
        paygEnabled: false,
      },
    );
  }

  const paymentMethod = policy.defaultPaymentMethod;

  if (!prepaid) {
    if (!paymentMethod || paymentMethod.status !== "ACTIVE") {
      throw new AppError(
        413,
        "PLAN_LIMIT_EXCEEDED",
        `${input.metric} exceeds the current plan limit.`,
        {
          metric: input.metric,
          paygAvailable: true,
          paygEnabled: false,
        },
      );
    }

    if (paymentMethod.provider === "STRIPE" && !env.STRIPE_PAYG_ENABLED) {
      throw new AppError(
        402,
        "PAYG_PROVIDER_UNAVAILABLE",
        "The saved-card provider is unavailable.",
      );
    }

    if (paymentMethod.provider === "SSLCOMMERZ") {
      throw new AppError(
        402,
        "PAYG_PROVIDER_UNAVAILABLE",
        "SSLCOMMERZ recurring-token approval is required.",
      );
    }
  }

  const existingAuthorization = await tx.paygAuthorization.findUnique({
    where: { operationKey: input.operationKey },
  });

  if (existingAuthorization) {
    if (
      existingAuthorization.workspaceId !== input.workspaceId ||
      existingAuthorization.metric !== input.metric
    ) {
      throw new AppError(
        409,
        "PAYG_OPERATION_KEY_CONFLICT",
        "The PAYG operation key belongs to another operation.",
      );
    }

    if (
      existingAuthorization.status === "ACTIVE" &&
      existingAuthorization.expiresAt > new Date()
    ) {
      return {
        metric: input.metric,
        amountMinor: existingAuthorization.estimatedAmountMinor,
        currency: input.currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        operationKey: input.operationKey,
      };
    }

    if (existingAuthorization.status === "COMMITTED") {
      return {
        metric: input.metric,
        amountMinor: existingAuthorization.estimatedAmountMinor,
        currency: input.currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        operationKey: input.operationKey,
      };
    }

    throw new AppError(
      409,
      "PAYG_OPERATION_KEY_EXPIRED",
      "The PAYG authorization expired or was released.",
    );
  }

  const activeMetricQuantity = await tx.paygAuthorization.aggregate({
    where: {
      workspaceId: input.workspaceId,
      metric: input.metric,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    _sum: { requestedQuantity: true },
  });

  const pricingCurrent =
    input.current + (activeMetricQuantity._sum.requestedQuantity ?? 0n);

  const charge = incrementalOverageAmount({
    current: pricingCurrent,
    requested: input.requested,
    limit: effectiveLimit,
    unitSize,
    unitPriceMinor: price,
  });

  if (charge.amountMinor === 0n) return null;

  if (metricPolicy.metricSpendCapMinor) {
    const [metricLedger, metricAuthorizations] = await Promise.all([
      tx.paygLedgerEntry.aggregate({
        where: {
          workspaceId: input.workspaceId,
          metric: input.metric,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: { in: ["PENDING", "CHARGED"] },
        },
        _sum: { amountMinor: true },
      }),
      tx.paygAuthorization.aggregate({
        where: {
          workspaceId: input.workspaceId,
          metric: input.metric,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        _sum: { estimatedAmountMinor: true },
      }),
    ]);

    const metricSpend =
      (metricLedger._sum.amountMinor ?? 0n) +
      (metricAuthorizations._sum.estimatedAmountMinor ?? 0n);

    if (metricSpend + charge.amountMinor > metricPolicy.metricSpendCapMinor) {
      throw new AppError(
        402,
        "PAYG_METRIC_CAP_REACHED",
        `The PAYG cap for ${input.metric} would be exceeded.`,
        {
          metric: input.metric,
          metricSpendCapMinor: metricPolicy.metricSpendCapMinor.toString(),
          currency: policy.currency,
        },
      );
    }
  }

  if (prepaid) {
    await lockWallet(tx, input.workspaceId);

    const wallet = await tx.prepaidWallet.findUnique({
      where: { workspaceId: input.workspaceId },
    });

    if (
      !wallet ||
      wallet.status !== "ACTIVE" ||
      wallet.currency !== input.currency
    ) {
      throw new AppError(
        402,
        "PREPAID_WALLET_UNAVAILABLE",
        "The prepaid wallet is unavailable.",
      );
    }

    const available = wallet.balanceMinor - wallet.reservedMinor;

    if (available < charge.amountMinor) {
      throw new AppError(
        402,
        "PREPAID_BALANCE_INSUFFICIENT",
        "Top up the prepaid wallet to continue.",
        {
          currency: wallet.currency,
          balanceMinor: wallet.balanceMinor.toString(),
          reservedMinor: wallet.reservedMinor.toString(),
          availableMinor: available.toString(),
          requiredMinor: charge.amountMinor.toString(),
        },
      );
    }

    await tx.prepaidWallet.update({
      where: { id: wallet.id },
      data: {
        reservedMinor: {
          increment: charge.amountMinor,
        },
      },
    });
  } else {
    const [ledger, activeAuthorizations] = await Promise.all([
      tx.paygLedgerEntry.aggregate({
        where: {
          workspaceId: input.workspaceId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: { in: ["PENDING", "CHARGED"] },
        },
        _sum: { amountMinor: true },
      }),
      tx.paygAuthorization.aggregate({
        where: {
          workspaceId: input.workspaceId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        _sum: { estimatedAmountMinor: true },
      }),
    ]);

    const existingSpend =
      (ledger._sum.amountMinor ?? 0n) +
      (activeAuthorizations._sum.estimatedAmountMinor ?? 0n);

    if (existingSpend + charge.amountMinor > policy.monthlySpendCapMinor) {
      throw new AppError(
        402,
        "PAYG_SPEND_CAP_REACHED",
        "The PAYG monthly spend cap would be exceeded.",
      );
    }
  }

  const expiresAt = new Date(
    Date.now() + env.PAYG_AUTHORIZATION_TTL_MINUTES * 60_000,
  );

  await tx.paygAuthorization.create({
    data: {
      workspaceId: input.workspaceId,
      metric: input.metric,
      operationKey: input.operationKey,
      requestedQuantity: input.requested,
      estimatedAmountMinor: charge.amountMinor,
      currency: input.currency,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      expiresAt,
    },
  });

  return {
    metric: input.metric,
    amountMinor: charge.amountMinor,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    operationKey: input.operationKey,
  };
}

export async function recordPaygLedgerInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    usageEventId: string;
    metric: UsageMetricName;
    quantity: bigint;
    currentBefore: bigint;
    entitlement: EntitlementValue;
    includedLimit?: bigint;
    currency: BillingCurrencyName;
    periodStart: Date;
    periodEnd: Date;
    operationKey?: string;
  },
): Promise<void> {
  if (input.quantity <= 0n || !isPaygEligibleMetric(input.metric)) {
    return;
  }

  const preference = await tx.billingPreference.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { revenueModel: true },
  });
  const prepaid = preference?.revenueModel === "PREPAID_PAYG";
  const effectiveLimit = 0n;

  if (!prepaid) {
    if (input.operationKey) {
      await tx.paygAuthorization.updateMany({
        where: {
          operationKey: input.operationKey,
          status: "ACTIVE",
        },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
        },
      });
    }
    return;
  }

  const authorization = input.operationKey
    ? await tx.paygAuthorization.findUnique({
        where: { operationKey: input.operationKey },
      })
    : null;

  if (
    authorization &&
    (authorization.workspaceId !== input.workspaceId ||
      authorization.metric !== input.metric)
  ) {
    throw new AppError(
      409,
      "PAYG_AUTHORIZATION_MISMATCH",
      "The PAYG authorization does not match the usage.",
    );
  }

  const policy = await tx.paygPolicy.findUnique({
    where: { workspaceId: input.workspaceId },
    include: {
      metrics: {
        where: {
          metric: input.metric,
          enabled: true,
        },
      },
    },
  });

  const unitSize = input.entitlement.overageUnit;
  const price = unitPrice(input.entitlement, input.currency);

  if (
    (!authorization &&
      (!policy ||
        policy.status !== "ACTIVE" ||
        policy.currency !== input.currency ||
        policy.metrics.length === 0)) ||
    !unitSize ||
    price === null
  ) {
    return;
  }

  const charge = incrementalOverageAmount({
    current: input.currentBefore,
    requested: input.quantity,
    limit: effectiveLimit,
    unitSize,
    unitPriceMinor: price,
  });

  const authorizedAmount = authorization?.estimatedAmountMinor;
  const amountMinor =
    authorizedAmount !== undefined && charge.amountMinor > authorizedAmount
      ? authorizedAmount
      : charge.amountMinor;
  const billableUnits = price > 0n ? amountMinor / price : charge.billableUnits;

  if (amountMinor <= 0n) {
    if (input.operationKey) {
      await tx.paygAuthorization.updateMany({
        where: {
          operationKey: input.operationKey,
          status: "ACTIVE",
        },
        data: {
          status: "COMMITTED",
          committedAt: new Date(),
        },
      });
    }
    return;
  }

  const existing = await tx.paygLedgerEntry.findUnique({
    where: { usageEventId: input.usageEventId },
  });

  if (existing) return;

  const ledger = await tx.paygLedgerEntry.create({
    data: {
      workspaceId: input.workspaceId,
      usageEventId: input.usageEventId,
      metric: input.metric,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      quantity: input.quantity,
      billableUnits,
      unitSize,
      unitPriceMinor: price,
      amountMinor,
      currency: input.currency,
      status: prepaid ? "CHARGED" : "PENDING",
    },
  });

  if (prepaid) {
    await lockWallet(tx, input.workspaceId);

    const wallet = await tx.prepaidWallet.findUnique({
      where: { workspaceId: input.workspaceId },
    });

    if (
      !wallet ||
      wallet.status !== "ACTIVE" ||
      wallet.currency !== input.currency
    ) {
      throw new AppError(
        402,
        "PREPAID_WALLET_UNAVAILABLE",
        "The prepaid wallet is unavailable.",
      );
    }

    const reserved = authorization?.estimatedAmountMinor ?? 0n;
    const availableBefore = wallet.balanceMinor - wallet.reservedMinor;

    if (reserved === 0n && availableBefore < amountMinor) {
      throw new AppError(
        402,
        "PREPAID_BALANCE_INSUFFICIENT",
        "Top up the prepaid wallet to continue.",
      );
    }

    const nextBalance = wallet.balanceMinor - amountMinor;
    const nextReserved =
      wallet.reservedMinor > reserved ? wallet.reservedMinor - reserved : 0n;

    if (nextBalance < 0n) {
      throw new AppError(
        402,
        "PREPAID_BALANCE_INSUFFICIENT",
        "Top up the prepaid wallet to continue.",
      );
    }

    await tx.prepaidWallet.update({
      where: { id: wallet.id },
      data: {
        balanceMinor: nextBalance,
        reservedMinor: nextReserved,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        workspaceId: input.workspaceId,
        kind: "PAYG_DEBIT",
        amountMinor: -amountMinor,
        balanceAfterMinor: nextBalance,
        currency: input.currency,
        idempotencyKey: `payg-debit:${input.usageEventId}`,
        paygLedgerEntryId: ledger.id,
        reference: input.operationKey ?? input.usageEventId,
        metadata: {
          metric: input.metric,
          quantity: input.quantity.toString(),
          unitSize: unitSize.toString(),
          unitPriceMinor: price.toString(),
        },
      },
    });
  }

  if (input.operationKey) {
    await tx.paygAuthorization.updateMany({
      where: {
        operationKey: input.operationKey,
        status: "ACTIVE",
      },
      data: {
        status: "COMMITTED",
        committedAt: new Date(),
      },
    });
  }
}

export async function releaseExpiredPaygAuthorizations(): Promise<number> {
  const expired = await prisma.paygAuthorization.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: new Date() },
    },
    orderBy: { expiresAt: "asc" },
    take: 1000,
  });

  let released = 0;

  for (const item of expired) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.paygAuthorization.findUnique({
        where: { id: item.id },
      });

      if (
        !current ||
        current.status !== "ACTIVE" ||
        current.expiresAt > new Date()
      ) {
        return;
      }

      await lockWallet(tx, current.workspaceId);
      await releaseWalletReservation(
        tx,
        current.workspaceId,
        current.estimatedAmountMinor,
      );

      await tx.paygAuthorization.update({
        where: { id: current.id },
        data: {
          status: "EXPIRED",
          releasedAt: new Date(),
        },
      });

      released += 1;
    });
  }

  return released;
}
