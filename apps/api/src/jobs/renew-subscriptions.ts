import "../bootstrap.js";
import { prisma } from "@media/database";
import { env } from "../config/env.js";
import { getPeriodBounds } from "../modules/billing/billing.utils.js";

function addDays(value: Date, days: number): Date {
  return new Date(
    value.getTime() + days * 24 * 60 * 60 * 1000
  );
}

async function advanceUsagePeriods(now: Date): Promise<number> {
  const subscriptions =
    await prisma.workspaceSubscription.findMany({
      where: {
        status: {
          in: ["ACTIVE", "TRIALING", "GRACE_PERIOD"]
        },
        periodEnd: { lte: now },
        OR: [
          { revenueModel: "PREPAID_PAYG" },
          { subscriptionTerm: "FREE" },
          { commitmentEndsAt: { gt: now } }
        ]
      },
      orderBy: { periodEnd: "asc" },
      take: 1000
    });

  let advanced = 0;

  for (const subscription of subscriptions) {
    let period = getPeriodBounds(
      subscription.periodEnd,
      "MONTHLY"
    );

    while (period.end <= now) {
      period = getPeriodBounds(
        period.end,
        "MONTHLY"
      );
    }

    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        periodStart: period.start,
        periodEnd: period.end,
        status: "ACTIVE",
        graceEndsAt: null
      }
    });
    advanced += 1;
  }

  return advanced;
}

async function main(): Promise<void> {
  const now = new Date();
  const usagePeriodsAdvanced =
    await advanceUsagePeriods(now);

  const due =
    await prisma.workspaceSubscription.findMany({
      where: {
        revenueModel: "SUBSCRIPTION",
        subscriptionTerm: {
          in: [
            "THREE_MONTHS",
            "SIX_MONTHS",
            "ONE_YEAR"
          ]
        },
        status: {
          in: [
            "ACTIVE",
            "TRIALING",
            "GRACE_PERIOD",
            "PAST_DUE"
          ]
        },
        commitmentEndsAt: {
          not: null,
          lte: now
        }
      },
      orderBy: { commitmentEndsAt: "asc" },
      take: 500,
      include: {
        planVersion: {
          include: {
            plan: true,
            entitlements: {
              where: { metric: "STORAGE_BYTES" },
              take: 1
            }
          }
        }
      }
    });

  let renewed = 0;
  let grace = 0;
  let pastDue = 0;
  let cancelled = 0;

  for (const subscription of due) {
    const paidRenewal =
      await prisma.billingInvoice.findFirst({
        where: {
          workspaceId: subscription.workspaceId,
          kind: "RENEWAL",
          status: "PAID",
          periodStart: {
            gte: subscription.commitmentEndsAt ??
              subscription.periodEnd
          }
        },
        orderBy: { periodStart: "asc" },
        include: {
          planVersion: {
            include: {
              plan: true,
              entitlements: {
                where: { metric: "STORAGE_BYTES" },
                take: 1
              }
            }
          }
        }
      });

    if (
      subscription.cancelAtPeriodEnd &&
      !paidRenewal
    ) {
      await prisma.workspaceSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          graceEndsAt: null
        }
      });
      cancelled += 1;
      continue;
    }

    if (paidRenewal) {
      const usagePeriod = getPeriodBounds(
        now,
        "MONTHLY"
      );
      const storageLimit =
        paidRenewal.planVersion.entitlements[0]
          ?.includedAmount;

      await prisma.$transaction(async tx => {
        await tx.workspaceSubscription.update({
          where: { id: subscription.id },
          data: {
            planVersionId:
              paidRenewal.planVersionId,
            currency: paidRenewal.currency,
            interval: paidRenewal.interval,
            revenueModel: "SUBSCRIPTION",
            subscriptionTerm:
              paidRenewal.subscriptionTerm,
            commitmentEndsAt:
              paidRenewal.periodEnd,
            periodStart: usagePeriod.start,
            periodEnd: usagePeriod.end,
            cancelAtPeriodEnd: false,
            status: "ACTIVE",
            graceEndsAt: null
          }
        });

        await tx.billingPreference.upsert({
          where: {
            workspaceId: subscription.workspaceId
          },
          create: {
            workspaceId: subscription.workspaceId,
            preferredCurrency:
              paidRenewal.currency,
            preferredInterval:
              paidRenewal.interval,
            revenueModel: "SUBSCRIPTION",
            subscriptionTerm:
              paidRenewal.subscriptionTerm
          },
          update: {
            preferredCurrency:
              paidRenewal.currency,
            preferredInterval:
              paidRenewal.interval,
            revenueModel: "SUBSCRIPTION",
            subscriptionTerm:
              paidRenewal.subscriptionTerm
          }
        });

        if (storageLimit !== undefined) {
          await tx.$executeRaw`
            UPDATE "Workspace"
            SET "storageLimitBytes" = GREATEST(
              "storageUsedBytes",
              ${storageLimit}
            )
            WHERE "id" = ${subscription.workspaceId}
          `;
        }

        if (paidRenewal.subscriptionChangeId) {
          await tx.subscriptionChange.updateMany({
            where: {
              id: paidRenewal.subscriptionChangeId,
              status: "APPROVED"
            },
            data: {
              status: "APPLIED",
              effectiveAt: usagePeriod.start
            }
          });
        }

        await tx.auditLog.create({
          data: {
            workspaceId: subscription.workspaceId,
            action: "subscription.renewed",
            entityType: "BillingInvoice",
            entityId: paidRenewal.id,
            metadata: {
              planCode:
                paidRenewal.planVersion.plan.code,
              currency: paidRenewal.currency,
              subscriptionTerm:
                paidRenewal.subscriptionTerm,
              commitmentEndsAt:
                paidRenewal.periodEnd.toISOString()
            }
          }
        });
      });

      renewed += 1;
      continue;
    }

    const graceEndsAt =
      subscription.graceEndsAt ??
      addDays(
        subscription.commitmentEndsAt ?? now,
        env.PAYMENT_GRACE_DAYS
      );
    const nextStatus =
      now < graceEndsAt
        ? "GRACE_PERIOD"
        : "PAST_DUE";

    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        status: nextStatus,
        graceEndsAt
      }
    });

    if (nextStatus === "GRACE_PERIOD") {
      grace += 1;
    } else {
      pastDue += 1;
    }
  }

  console.log(JSON.stringify({
    checked: due.length,
    usagePeriodsAdvanced,
    renewed,
    grace,
    pastDue,
    cancelled
  }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
