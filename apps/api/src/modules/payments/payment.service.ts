import { prisma, Prisma } from "@media/database";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { AppError } from "../../shared/http.js";
import { getPeriodBounds, getSubscriptionCommitmentBounds } from "../billing/billing.utils.js";
import { createInvoiceNumber } from "./payment.utils.js";

export type PaymentTransaction = Prisma.TransactionClient;
type BillingCurrency = "BDT" | "USD";
type BillingInterval = "MONTHLY" | "YEARLY";
type SubscriptionTerm =
  | "FREE"
  | "THREE_MONTHS"
  | "SIX_MONTHS"
  | "ONE_YEAR"
  | "ENTERPRISE_CUSTOM";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function createInvoiceForSubscriptionChange(
  tx: PaymentTransaction,
  input: {
    workspaceId: string;
    subscriptionChangeId: string;
    requestedById: string;
    planVersionId: string;
    currency: BillingCurrency;
    interval: BillingInterval;
    subscriptionTerm?: SubscriptionTerm;
    amountMinor: bigint;
    planCode: string;
    planName: string;
    planVersion: number;
  }
) {
  const now = new Date();
  const subscriptionTerm =
    input.subscriptionTerm ??
    (input.interval === "YEARLY" ? "ONE_YEAR" : "THREE_MONTHS");
  const period = getSubscriptionCommitmentBounds(
    now,
    subscriptionTerm
  );

  return tx.billingInvoice.create({
    data: {
      number: createInvoiceNumber(),
      kind: "PLAN_CHANGE",
      workspaceId: input.workspaceId,
      subscriptionChangeId: input.subscriptionChangeId,
      requestedById: input.requestedById,
      planVersionId: input.planVersionId,
      currency: input.currency,
      interval: input.interval,
      revenueModel: "SUBSCRIPTION",
      subscriptionTerm,
      amountMinor: input.amountMinor,
      periodStart: period.start,
      periodEnd: period.end,
      dueAt: addDays(now, 7),
      snapshot: jsonValue({
        kind: "PLAN_CHANGE",
        planCode: input.planCode,
        planName: input.planName,
        planVersion: input.planVersion,
        currency: input.currency,
        interval: input.interval,
        revenueModel: "SUBSCRIPTION",
        subscriptionTerm,
        amountMinor: input.amountMinor.toString()
      })
    }
  });
}

export async function createRenewalInvoice(
  tx: PaymentTransaction,
  input: {
    renewalKey: string;
    workspaceId: string;
    subscriptionChangeId?: string | null;
    requestedById: string;
    planVersionId: string;
    currency: BillingCurrency;
    interval: BillingInterval;
    subscriptionTerm?: SubscriptionTerm;
    amountMinor: bigint;
    planCode: string;
    planName: string;
    planVersion: number;
    periodStart: Date;
    periodEnd: Date;
    dueAt: Date;
  }
) {
  const subscriptionTerm =
    input.subscriptionTerm ??
    (input.interval === "YEARLY" ? "ONE_YEAR" : "THREE_MONTHS");

  return tx.billingInvoice.create({
    data: {
      number: createInvoiceNumber(),
      kind: "RENEWAL",
      renewalKey: input.renewalKey,
      workspaceId: input.workspaceId,
      subscriptionChangeId: input.subscriptionChangeId ?? null,
      requestedById: input.requestedById,
      planVersionId: input.planVersionId,
      currency: input.currency,
      interval: input.interval,
      revenueModel: "SUBSCRIPTION",
      subscriptionTerm,
      amountMinor: input.amountMinor,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueAt: input.dueAt,
      snapshot: jsonValue({
        kind: "RENEWAL",
        planCode: input.planCode,
        planName: input.planName,
        planVersion: input.planVersion,
        currency: input.currency,
        interval: input.interval,
        revenueModel: "SUBSCRIPTION",
        subscriptionTerm,
        amountMinor: input.amountMinor.toString(),
        periodStart: input.periodStart.toISOString(),
        periodEnd: input.periodEnd.toISOString()
      })
    }
  });
}

export async function getInvoiceForWorkspace(
  invoiceId: string,
  workspaceId: string
) {
  const invoice = await prisma.billingInvoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      planVersion: { include: { plan: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        include: {
          manualSubmission: { include: { account: true } }
        }
      }
    }
  });

  if (!invoice) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found.");
  }

  return invoice;
}

export async function assertInvoicePayable(
  invoiceId: string,
  workspaceId: string
) {
  const invoice = await getInvoiceForWorkspace(invoiceId, workspaceId);

  if (invoice.status !== "OPEN") {
    throw new AppError(
      409,
      "INVOICE_NOT_PAYABLE",
      "This invoice is no longer open for payment."
    );
  }

  // Plan-change invoices expire after the quoted price window. Renewal
  // invoices remain payable so a past-due workspace can recover service.
  if (invoice.kind !== "RENEWAL" && invoice.dueAt <= new Date()) {
    await prisma.$transaction([
      prisma.billingInvoice.update({
        where: { id: invoice.id },
        data: { status: "EXPIRED" }
      }),
      prisma.subscriptionChange.updateMany({
        where: {
          id: invoice.subscriptionChangeId ?? "",
          status: "PAYMENT_PENDING"
        },
        data: {
          status: "CANCELLED",
          reviewedAt: new Date(),
          note: "Invoice expired before payment."
        }
      })
    ]);

    throw new AppError(
      409,
      "INVOICE_EXPIRED",
      invoice.kind === "WALLET_TOPUP"
        ? "This top-up invoice expired. Create a new top-up."
        : "This invoice expired. Request the plan again."
    );
  }

  return invoice;
}

export async function applyPaidPayment(input: {
  paymentAttemptId: string;
  actorId?: string | null;
  ipAddress?: string | null;
  note: string;
}) {
  const result = await prisma.$transaction(async tx => {
    const initial = await tx.paymentAttempt.findUnique({
      where: { id: input.paymentAttemptId },
      select: { invoiceId: true }
    });

    if (!initial) {
      throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
    }

    await tx.$queryRaw`
      SELECT "id"
      FROM "BillingInvoice"
      WHERE "id" = ${initial.invoiceId}
      FOR UPDATE
    `;

    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: input.paymentAttemptId },
      include: {
        invoice: {
          include: {
            subscriptionChange: true,
            planVersion: {
              include: {
                plan: true,
                entitlements: {
                  where: { metric: "STORAGE_BYTES" },
                  take: 1
                }
              }
            },
            requestedBy: {
              select: { email: true, name: true }
            }
          }
        }
      }
    });

    if (!attempt) {
      throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
    }

    if (attempt.status === "PAID" || attempt.invoice.status === "PAID") {
      return {
        invoice: attempt.invoice,
        alreadyApplied: true,
        subscriptionActivated: false,
        email: attempt.invoice.requestedBy.email,
        planName: attempt.invoice.planVersion.plan.name
      };
    }

    if (!new Set(["PROCESSING", "UNDER_REVIEW"]).has(attempt.status)) {
      throw new AppError(
        409,
        "PAYMENT_NOT_APPROVABLE",
        "Payment is not ready for approval."
      );
    }

    if (attempt.invoice.status !== "OPEN") {
      throw new AppError(409, "INVOICE_NOT_PAYABLE", "Invoice is not open.");
    }

    if (
      attempt.amountMinor !== attempt.invoice.amountMinor ||
      attempt.currency !== attempt.invoice.currency
    ) {
      throw new AppError(
        409,
        "PAYMENT_INVOICE_MISMATCH",
        "Payment amount or currency does not match the invoice."
      );
    }

    if (attempt.invoice.kind === "WALLET_TOPUP") {
      const now = new Date();

      await tx.$queryRaw`
        SELECT "id"
        FROM "Workspace"
        WHERE "id" = ${attempt.invoice.workspaceId}
        FOR UPDATE
      `;

      await tx.$queryRaw`
        SELECT "id"
        FROM "PrepaidWallet"
        WHERE "workspaceId" = ${attempt.invoice.workspaceId}
        FOR UPDATE
      `;

      let wallet = await tx.prepaidWallet.findUnique({
        where: { workspaceId: attempt.invoice.workspaceId }
      });

      if (!wallet) {
        wallet = await tx.prepaidWallet.create({
          data: {
            workspaceId: attempt.invoice.workspaceId,
            currency: attempt.invoice.currency,
            lowBalanceThresholdMinor:
              attempt.invoice.currency === "BDT" ? 10000n : 100n
          }
        });
      }

      if (
        wallet.currency !== attempt.invoice.currency ||
        wallet.status !== "ACTIVE"
      ) {
        throw new AppError(
          409,
          "WALLET_NOT_CREDITABLE",
          "The prepaid wallet cannot accept this payment."
        );
      }

      const existingCredit =
        await tx.walletTransaction.findUnique({
          where: {
            idempotencyKey: `wallet-topup:${attempt.invoice.id}`
          }
        });

      const nextBalance =
        wallet.balanceMinor + attempt.invoice.amountMinor;

      if (!existingCredit) {
        await tx.prepaidWallet.update({
          where: { id: wallet.id },
          data: { balanceMinor: nextBalance }
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            workspaceId: attempt.invoice.workspaceId,
            kind: "TOP_UP",
            amountMinor: attempt.invoice.amountMinor,
            balanceAfterMinor: nextBalance,
            currency: attempt.invoice.currency,
            idempotencyKey:
              `wallet-topup:${attempt.invoice.id}`,
            invoiceId: attempt.invoice.id,
            reference: attempt.providerTransactionId ??
              attempt.bankTransactionId ??
              attempt.id,
            createdById: input.actorId ?? null,
            metadata: {
              paymentAttemptId: attempt.id,
              paymentMethod: attempt.method
            }
          }
        });
      }

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "PAID", completedAt: now }
      });

      await tx.billingInvoice.update({
        where: { id: attempt.invoice.id },
        data: {
          status: "PAID",
          paidAt: now
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: attempt.invoice.workspaceId,
          actorId: input.actorId ?? null,
          action: "wallet.topup_completed",
          entityType: "BillingInvoice",
          entityId: attempt.invoice.id,
          metadata: {
            invoiceNumber: attempt.invoice.number,
            amountMinor: attempt.invoice.amountMinor.toString(),
            currency: attempt.invoice.currency,
            balanceAfterMinor: (
              existingCredit?.balanceAfterMinor ??
              nextBalance
            ).toString(),
            method: attempt.method
          },
          ipAddress: input.ipAddress ?? null
        }
      });

      return {
        invoice: {
          ...attempt.invoice,
          status: "PAID" as const,
          paidAt: now
        },
        alreadyApplied: false,
        subscriptionActivated: false,
        walletCredited: true,
        email: attempt.invoice.requestedBy.email,
        planName: "Prepaid wallet"
      };
    }

    const storageEntitlement = attempt.invoice.planVersion.entitlements[0];
    if (!storageEntitlement) {
      throw new AppError(
        503,
        "ENTITLEMENT_NOT_CONFIGURED",
        "Storage entitlement is missing from the selected plan."
      );
    }

    const currentSubscription = await tx.workspaceSubscription.findUnique({
      where: { workspaceId: attempt.invoice.workspaceId }
    });

    if (!currentSubscription) {
      throw new AppError(
        404,
        "SUBSCRIPTION_NOT_FOUND",
        "Workspace subscription was not found."
      );
    }

    const now = new Date();
    const renewalIsDue =
      attempt.invoice.kind === "RENEWAL" &&
      (
        currentSubscription.commitmentEndsAt ??
        currentSubscription.periodEnd
      ) <= now;
    const subscriptionActivated =
      attempt.invoice.kind === "PLAN_CHANGE" || renewalIsDue;

    let subscription = currentSubscription;
    let effectivePeriod = {
      start: attempt.invoice.periodStart,
      end: attempt.invoice.periodEnd
    };
    const commitment =
      attempt.invoice.kind === "PLAN_CHANGE"
        ? getSubscriptionCommitmentBounds(
            now,
            attempt.invoice.subscriptionTerm
          )
        : {
            start: attempt.invoice.periodStart,
            end: attempt.invoice.periodEnd
          };

    if (attempt.invoice.kind === "PLAN_CHANGE") {
      effectivePeriod = getPeriodBounds(now, "MONTHLY");
    } else if (renewalIsDue) {
      effectivePeriod = getPeriodBounds(now, "MONTHLY");
    }

    if (subscriptionActivated) {
      subscription = await tx.workspaceSubscription.update({
        where: { workspaceId: attempt.invoice.workspaceId },
        data: {
          planVersionId: attempt.invoice.planVersionId,
          currency: attempt.invoice.currency,
          interval: attempt.invoice.interval,
          revenueModel: "SUBSCRIPTION",
          subscriptionTerm:
            attempt.invoice.subscriptionTerm,
          commitmentEndsAt:
            commitment.end,
          status: "ACTIVE",
          periodStart: effectivePeriod.start,
          periodEnd: effectivePeriod.end,
          cancelAtPeriodEnd: false,
          graceEndsAt: null
        }
      });

      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageLimitBytes" = GREATEST(
          "storageUsedBytes",
          ${storageEntitlement.includedAmount}
        )
        WHERE "id" = ${attempt.invoice.workspaceId}
      `;

      await tx.paygPolicy.updateMany({
        where: { workspaceId: attempt.invoice.workspaceId },
        data: {
          status: "DISABLED",
          pausedAt: null,
          pauseReason: null
        }
      });

      await tx.billingPreference.upsert({
        where: { workspaceId: attempt.invoice.workspaceId },
        create: {
          workspaceId: attempt.invoice.workspaceId,
          preferredCurrency: attempt.invoice.currency,
          preferredInterval: attempt.invoice.interval,
          revenueModel: "SUBSCRIPTION",
          subscriptionTerm:
            attempt.invoice.subscriptionTerm
        },
        update: {
          preferredCurrency: attempt.invoice.currency,
          preferredInterval: attempt.invoice.interval,
          revenueModel: "SUBSCRIPTION",
          subscriptionTerm:
            attempt.invoice.subscriptionTerm
        }
      });
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "PAID", completedAt: now }
    });

    await tx.billingInvoice.update({
      where: { id: attempt.invoice.id },
      data: {
        status: "PAID",
        paidAt: now
      }
    });

    if (attempt.invoice.subscriptionChangeId && subscriptionActivated) {
      await tx.subscriptionChange.update({
        where: { id: attempt.invoice.subscriptionChangeId },
        data: {
          status: "APPLIED",
          effectiveAt: effectivePeriod.start,
          reviewedById: input.actorId ?? null,
          reviewedAt: now,
          note: input.note
        }
      });
    }

    if (attempt.invoice.kind === "PLAN_CHANGE") {
      const otherChanges = await tx.subscriptionChange.findMany({
        where: {
          workspaceId: attempt.invoice.workspaceId,
          id: { not: attempt.invoice.subscriptionChangeId ?? "" },
          status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] }
        },
        select: { id: true }
      });
      const changeIds = otherChanges.map(item => item.id);
      const otherInvoices = await tx.billingInvoice.findMany({
        where: {
          workspaceId: attempt.invoice.workspaceId,
          id: { not: attempt.invoice.id },
          status: "OPEN"
        },
        select: { id: true }
      });
      const invoiceIds = otherInvoices.map(item => item.id);

      if (invoiceIds.length > 0) {
        await tx.paymentAttempt.updateMany({
          where: {
            invoiceId: { in: invoiceIds },
            status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] }
          },
          data: {
            status: "CANCELLED",
            completedAt: now,
            failureReason: "Superseded by a paid subscription change."
          }
        });
      }

      if (changeIds.length > 0) {
        await tx.subscriptionChange.updateMany({
          where: { id: { in: changeIds } },
          data: {
            status: "CANCELLED",
            reviewedById: input.actorId ?? null,
            reviewedAt: now,
            note: "Superseded by a paid subscription change."
          }
        });
      }

      if (invoiceIds.length > 0) {
        await tx.billingInvoice.updateMany({
          where: { id: { in: invoiceIds } },
          data: { status: "VOID", voidedAt: now }
        });
      }
    }

    await tx.auditLog.create({
      data: {
        workspaceId: attempt.invoice.workspaceId,
        actorId: input.actorId ?? null,
        action: subscriptionActivated
          ? "payment.completed"
          : "payment.renewal_scheduled",
        entityType: "PaymentAttempt",
        entityId: attempt.id,
        metadata: {
          invoiceId: attempt.invoice.id,
          invoiceNumber: attempt.invoice.number,
          invoiceKind: attempt.invoice.kind,
          method: attempt.method,
          amountMinor: attempt.amountMinor.toString(),
          currency: attempt.currency,
          planCode: attempt.invoice.planVersion.plan.code,
          periodStart: effectivePeriod.start.toISOString(),
          periodEnd: effectivePeriod.end.toISOString()
        },
        ipAddress: input.ipAddress ?? null
      }
    });

    return {
      invoice: {
        ...attempt.invoice,
        status: "PAID" as const,
        paidAt: now,
        periodStart: effectivePeriod.start,
        periodEnd: effectivePeriod.end
      },
      subscription,
      alreadyApplied: false,
      subscriptionActivated,
      email: attempt.invoice.requestedBy.email,
      planName: attempt.invoice.planVersion.plan.name
    };
  });

  if (!result.alreadyApplied) {
    void sendSecurityEmail({
      to: result.email,
      subject: "Payment confirmed",
      text: "walletCredited" in result && result.walletCredited
        ? "Your payment was confirmed and your prepaid wallet balance has been credited."
        : result.subscriptionActivated
          ? `Your payment was confirmed and the ${result.planName} plan is now active.`
          : `Your payment was confirmed. The ${result.planName} plan will renew at the end of the current commitment.`
    }).catch(() => undefined);
  }

  return result;
}
