import { prisma } from "@media/database";
import { AppError } from "../../shared/http.js";
import type {
  BillingCurrencyName,
  UsageMetricName
} from "./billing.types.js";
import {
  calculateUsagePercent,
  formatMoneyMinor,
  projectUsage,
  usageState
} from "./billing.utils.js";
import {
  highestUsageThreshold,
  nextUsageThreshold,
  usageThresholdMessage
} from "./usage-alert-policy.js";

const prepaidBillableMetrics = new Set<UsageMetricName>([
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "UPLOAD_BYTES",
  "API_REQUESTS",
  "IMAGE_TRANSFORMATIONS",
  "VIDEO_PROCESSING_SECONDS",
  "PROCESSING_CPU_MILLISECONDS"
]);

const countMetrics = new Set<UsageMetricName>([
  "ACTIVE_ASSETS",
  "FOLDERS",
  "WORKSPACE_MEMBERS",
  "API_KEYS",
  "CONCURRENT_JOBS"
]);

function calculateOverage(input: {
  projected: bigint;
  limit: bigint;
  unit: bigint | null;
  priceMinor: bigint | null;
  currency: BillingCurrencyName;
}) {
  if (
    input.projected <= input.limit ||
    !input.unit ||
    input.unit <= 0n ||
    input.priceMinor === null
  ) {
    return {
      units: "0",
      amountMinor: "0",
      formatted: formatMoneyMinor(0n, input.currency)
    };
  }

  const excess = input.projected - input.limit;
  const units = (excess + input.unit - 1n) / input.unit;
  const amountMinor = units * input.priceMinor;

  return {
    units: units.toString(),
    amountMinor: amountMinor.toString(),
    formatted: formatMoneyMinor(amountMinor, input.currency)
  };
}

export async function getWorkspaceUsageSnapshot(
  workspaceId: string
) {
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: {
      workspace: {
        select: {
          storageLimitBytes: true,
          storageUsedBytes: true,
          storageReservedBytes: true,
          billingPreference: {
            select: {
              revenueModel: true,
              subscriptionTerm: true
            }
          },
          prepaidWallet: {
            select: {
              currency: true,
              status: true,
              balanceMinor: true,
              reservedMinor: true,
              lowBalanceThresholdMinor: true
            }
          },
          paygPolicy: {
            select: {
              status: true,
              defaultPaymentMethod: {
                select: { status: true }
              },
              metrics: {
                where: { enabled: true },
                select: { metric: true }
              }
            }
          }
        }
      },
      planVersion: {
        include: {
          plan: true,
          prices: true,
          entitlements: {
            orderBy: { metric: "asc" }
          }
        }
      }
    }
  });

  if (!subscription) {
    throw new AppError(
      503,
      "BILLING_NOT_CONFIGURED",
      "Workspace billing is not configured."
    );
  }

  const [
    aggregates,
    activeAssets,
    folders,
    members,
    apiKeys,
    activeUploads,
    processingAssets
  ] = await prisma.$transaction([
    prisma.usageAggregate.findMany({
      where: {
        workspaceId,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd
      }
    }),
    prisma.mediaAsset.count({
      where: {
        workspaceId,
        status: { in: ["UPLOADING", "PROCESSING", "READY"] },
        deletedAt: null
      }
    }),
    prisma.folder.count({ where: { workspaceId } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.apiKey.count({
      where: { workspaceId, revokedAt: null }
    }),
    prisma.uploadSession.count({
      where: {
        workspaceId,
        status: { in: ["ACTIVE", "COMPLETING"] }
      }
    }),
    prisma.mediaAsset.count({
      where: {
        workspaceId,
        status: "PROCESSING",
        deletedAt: null
      }
    })
  ]);

  const aggregateMap = new Map(
    aggregates.map(value => [value.metric, value.quantity])
  );

  const directUsage = new Map<UsageMetricName, bigint>([
    ["STORAGE_BYTES", subscription.workspace.storageUsedBytes],
    ["ACTIVE_ASSETS", BigInt(activeAssets)],
    ["FOLDERS", BigInt(folders)],
    ["WORKSPACE_MEMBERS", BigInt(members)],
    ["API_KEYS", BigInt(apiKeys)],
    ["CONCURRENT_JOBS", BigInt(activeUploads + processingAssets)],
    ["MAX_FILE_SIZE_BYTES", 0n]
  ]);

  const now = new Date();
  const currency = subscription.currency;
  const paygPolicy = subscription.workspace.paygPolicy;
  const prepaidMode =
    subscription.workspace.billingPreference?.revenueModel ===
      "PREPAID_PAYG";
  const wallet = subscription.workspace.prepaidWallet;
  const paygConfigured =
    prepaidMode &&
    paygPolicy?.status === "ACTIVE";
  const paygOperational =
    paygConfigured &&
    Boolean(
      wallet &&
      wallet.status === "ACTIVE" &&
      wallet.balanceMinor - wallet.reservedMinor > 0n
    );
  const paygMetrics = new Set<UsageMetricName>(
    paygConfigured && paygPolicy
      ? paygPolicy.metrics.map(item => item.metric as UsageMetricName)
      : []
  );

  const metrics = subscription.planVersion.entitlements.map(entitlement => {
    const metric = entitlement.metric as UsageMetricName;
    const current = countMetrics.has(metric) ||
      metric === "STORAGE_BYTES" ||
      metric === "MAX_FILE_SIZE_BYTES"
      ? directUsage.get(metric) ?? 0n
      : aggregateMap.get(metric) ?? 0n;

    const planLimit = metric === "STORAGE_BYTES" &&
      subscription.workspace.storageLimitBytes > entitlement.includedAmount
      ? subscription.workspace.storageLimitBytes
      : entitlement.includedAmount;
    const limit = prepaidMode && prepaidBillableMetrics.has(metric)
      ? 0n
      : planLimit;

    const projected = countMetrics.has(metric) ||
      metric === "STORAGE_BYTES" ||
      metric === "MAX_FILE_SIZE_BYTES"
      ? current
      : projectUsage(
          current,
          subscription.periodStart,
          subscription.periodEnd,
          now
        );

    const percent = calculateUsagePercent(current, limit);
    const projectedPercent = calculateUsagePercent(projected, limit);
    const overagePrice = currency === "BDT"
      ? entitlement.overageBdtMinor
      : entitlement.overageUsdMinor;

    const paygEnabled = paygMetrics.has(metric);
    const threshold = paygEnabled
      ? null
      : highestUsageThreshold(percent);
    const blocked =
      !paygEnabled &&
      percent >= 100 &&
      entitlement.hardLimit;

    return {
      metric,
      current: current.toString(),
      reserved:
        metric === "STORAGE_BYTES"
          ? subscription.workspace.storageReservedBytes.toString()
          : "0",
      limit: limit.toString(),
      percent,
      threshold,
      nextThreshold: nextUsageThreshold(percent),
      state: usageState(percent),
      blocked,
      paygEnabled,
      warningMessage: threshold
        ? usageThresholdMessage({
            metric,
            threshold,
            blocked,
            paygEnabled
          })
        : null,
      projected: projected.toString(),
      projectedPercent,
      projectedState: usageState(projectedPercent),
      hardLimit: entitlement.hardLimit,
      overageAllowed: entitlement.overageAllowed,
      overage: calculateOverage({
        projected,
        limit,
        unit: entitlement.overageUnit,
        priceMinor: overagePrice,
        currency
      })
    };
  });

  return {
    plan: {
      code: subscription.planVersion.plan.code,
      name: subscription.planVersion.plan.name,
      version: subscription.planVersion.version
    },
    payg: {
      status: paygPolicy?.status ?? "DISABLED",
      operational: paygOperational,
      fundingMode: prepaidMode
        ? "PREPAID_WALLET"
        : "SAVED_PAYMENT_METHOD",
      enabledMetrics: [...paygMetrics],
      wallet: wallet
        ? {
            currency: wallet.currency,
            status: wallet.status,
            balanceMinor: wallet.balanceMinor.toString(),
            reservedMinor: wallet.reservedMinor.toString(),
            availableMinor:
              (wallet.balanceMinor - wallet.reservedMinor).toString(),
            lowBalanceThresholdMinor:
              wallet.lowBalanceThresholdMinor.toString()
          }
        : null
    },
    subscription: {
      status: subscription.status,
      currency: subscription.currency,
      interval: subscription.interval,
      revenueModel: subscription.revenueModel,
      subscriptionTerm: subscription.subscriptionTerm,
      commitmentEndsAt: subscription.commitmentEndsAt,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      trialEndsAt: subscription.trialEndsAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
    },
    metrics
  };
}
