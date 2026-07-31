import { Router } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@media/database";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { getPublicPricing } from "../billing/billing.service.js";
import { getWorkspaceUsageSnapshot } from "./usage-query.service.js";
import { createInvoiceForSubscriptionChange } from "../payments/payment.service.js";

const router = Router();
router.use(authenticate, requireUser);

const currencySchema = z.enum(["BDT", "USD"]);
const intervalSchema = z.enum(["MONTHLY", "YEARLY"]);
const addressSchema = z
  .object({
    line1: z.string().trim().max(160).optional(),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().max(100).optional(),
    region: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(30).optional(),
    countryCode: z.string().trim().length(2).optional(),
  })
  .partial();

function requireBillingManager(role: "OWNER" | "ADMIN" | "MEMBER"): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError(
      403,
      "BILLING_PERMISSION_REQUIRED",
      "Workspace owner or admin access is required.",
    );
  }
}

router.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    const workspaceId = req.auth!.workspaceId;
    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId },
      include: {
        planVersion: {
          include: {
            plan: true,
            prices: true,
            entitlements: { orderBy: { metric: "asc" } },
          },
        },
        workspace: {
          select: { name: true, slug: true },
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

    const [preference, pendingChange] = await Promise.all([
      prisma.billingPreference.findUnique({ where: { workspaceId } }),
      prisma.subscriptionChange.findFirst({
        where: {
          workspaceId,
          status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] },
        },
        orderBy: { createdAt: "desc" },
        include: {
          requestedPlanVersion: {
            include: { plan: true },
          },
          invoice: {
            select: {
              id: true,
              number: true,
              amountMinor: true,
              currency: true,
              status: true,
              dueAt: true,
            },
          },
        },
      }),
    ]);

    res.json({
      data: {
        id: subscription.id,
        workspace: subscription.workspace,
        status: subscription.status,
        currency: subscription.currency,
        interval: subscription.interval,
        revenueModel: subscription.revenueModel,
        subscriptionTerm: subscription.subscriptionTerm,
        commitmentEndsAt: subscription.commitmentEndsAt,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        plan: {
          code: subscription.planVersion.plan.code,
          name: subscription.planVersion.plan.name,
          version: subscription.planVersion.version,
          prices: subscription.planVersion.prices.map((price) => ({
            currency: price.currency,
            interval: price.interval,
            amountMinor: price.amountMinor.toString(),
          })),
          entitlements: subscription.planVersion.entitlements.map((item) => ({
            metric: item.metric,
            includedAmount: item.includedAmount.toString(),
            hardLimit: item.hardLimit,
            overageAllowed: item.overageAllowed,
          })),
        },
        preference,
        pendingChange: pendingChange
          ? {
              id: pendingChange.id,
              planCode: pendingChange.requestedPlanVersion.plan.code,
              planName: pendingChange.requestedPlanVersion.plan.name,
              currency: pendingChange.currency,
              interval: pendingChange.interval,
              revenueModel: pendingChange.revenueModel,
              subscriptionTerm: pendingChange.subscriptionTerm,
              status: pendingChange.status,
              effectiveAt: pendingChange.effectiveAt,
              createdAt: pendingChange.createdAt,
              invoice: pendingChange.invoice
                ? {
                    ...pendingChange.invoice,
                    amountMinor: pendingChange.invoice.amountMinor.toString(),
                  }
                : null,
            }
          : null,
      },
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/usage",
  asyncHandler(async (req, res) => {
    res.json({
      data: await getWorkspaceUsageSnapshot(req.auth!.workspaceId),
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/limits",
  asyncHandler(async (req, res) => {
    const snapshot = await getWorkspaceUsageSnapshot(req.auth!.workspaceId);

    res.json({
      data: snapshot.metrics,
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/projection",
  asyncHandler(async (req, res) => {
    const snapshot = await getWorkspaceUsageSnapshot(req.auth!.workspaceId);

    res.json({
      data: {
        periodStart: snapshot.subscription.periodStart,
        periodEnd: snapshot.subscription.periodEnd,
        currency: snapshot.subscription.currency,
        metrics: snapshot.metrics.map((metric) => ({
          metric: metric.metric,
          current: metric.current,
          projected: metric.projected,
          projectedPercent: metric.projectedPercent,
          projectedState: metric.projectedState,
          overage: metric.overage,
        })),
      },
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const currency = currencySchema.default("BDT").parse(req.query.currency);

    res.json({
      data: {
        currency,
        plans: await getPublicPricing(currency),
      },
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const item = await prisma.billingPreference.findUnique({
      where: { workspaceId: req.auth!.workspaceId },
    });

    res.json({
      data: item,
      meta: { requestId: req.id },
    });
  }),
);

router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z
      .object({
        preferredCurrency: currencySchema.optional(),
        preferredInterval: intervalSchema.optional(),
        billingEmail: z.string().trim().email().nullable().optional(),
        countryCode: z.string().trim().length(2).nullable().optional(),
        taxId: z.string().trim().max(80).nullable().optional(),
        companyName: z.string().trim().max(160).nullable().optional(),
        billingPhone: z.string().trim().min(6).max(40).nullable().optional(),
        billingAddress: addressSchema.nullable().optional(),
      })
      .parse(req.body);

    const billingAddress =
      input.billingAddress === null ? Prisma.DbNull : input.billingAddress;

    const item = await prisma.billingPreference.upsert({
      where: { workspaceId: req.auth!.workspaceId },
      create: {
        workspaceId: req.auth!.workspaceId,
        preferredCurrency: input.preferredCurrency ?? "BDT",
        preferredInterval: input.preferredInterval ?? "MONTHLY",
        billingEmail: input.billingEmail,
        countryCode: input.countryCode,
        taxId: input.taxId,
        companyName: input.companyName,
        billingPhone: input.billingPhone,
        billingAddress,
      },
      update: {
        preferredCurrency: input.preferredCurrency,
        preferredInterval: input.preferredInterval,
        billingEmail: input.billingEmail,
        countryCode: input.countryCode,
        taxId: input.taxId,
        companyName: input.companyName,
        billingPhone: input.billingPhone,
        billingAddress,
      },
    });

    res.json({
      data: item,
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/select-plan",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z
      .object({
        planCode: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .transform((value) => value.toUpperCase()),
        currency: currencySchema,
        interval: intervalSchema,
      })
      .parse(req.body);

    const version = await prisma.planVersion.findFirst({
      where: {
        plan: {
          code: input.planCode,
          isActive: true,
          isPublic: true,
        },
        publishedAt: { not: null },
        retiredAt: null,
        prices: {
          some: {
            currency: input.currency,
            interval: input.interval,
            isActive: true,
          },
        },
      },
      orderBy: { version: "desc" },
      include: {
        plan: true,
        prices: {
          where: {
            currency: input.currency,
            interval: input.interval,
            isActive: true,
          },
          take: 1,
        },
      },
    });

    const price = version?.prices[0];
    if (!version || !price) {
      throw new AppError(
        404,
        "PLAN_NOT_FOUND",
        "The requested plan or price is unavailable.",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const activeChanges = await tx.subscriptionChange.findMany({
        where: {
          workspaceId: req.auth!.workspaceId,
          status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] },
        },
        select: { id: true },
      });

      if (activeChanges.length > 0) {
        const changeIds = activeChanges.map((item) => item.id);
        await tx.subscriptionChange.updateMany({
          where: { id: { in: changeIds } },
          data: {
            status: "CANCELLED",
            reviewedAt: now,
            note: "Superseded by a newer plan request.",
          },
        });
        const invoices = await tx.billingInvoice.findMany({
          where: {
            subscriptionChangeId: { in: changeIds },
            status: "OPEN",
          },
          select: { id: true },
        });
        const invoiceIds = invoices.map((item) => item.id);
        if (invoiceIds.length > 0) {
          await tx.paymentAttempt.updateMany({
            where: {
              invoiceId: { in: invoiceIds },
              status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] },
            },
            data: {
              status: "CANCELLED",
              completedAt: now,
              failureReason: "Superseded by a newer plan request.",
            },
          });
          await tx.billingInvoice.updateMany({
            where: { id: { in: invoiceIds } },
            data: { status: "VOID", voidedAt: now },
          });
        }
      }

      const paymentRequired = price.amountMinor > 0n;
      const change = await tx.subscriptionChange.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          requestedById: req.auth!.userId,
          requestedPlanVersionId: version.id,
          currency: input.currency,
          interval: input.interval,
          status: paymentRequired ? "PAYMENT_PENDING" : "PENDING",
        },
      });

      const invoice = paymentRequired
        ? await createInvoiceForSubscriptionChange(tx, {
            workspaceId: req.auth!.workspaceId,
            subscriptionChangeId: change.id,
            requestedById: req.auth!.userId,
            planVersionId: version.id,
            currency: input.currency,
            interval: input.interval,
            amountMinor: price.amountMinor,
            planCode: version.plan.code,
            planName: version.plan.name,
            planVersion: version.version,
          })
        : null;

      return { change, invoice, paymentRequired };
    });

    res.status(202).json({
      data: {
        id: result.change.id,
        status: result.change.status,
        paymentRequired: result.paymentRequired,
        invoice: result.invoice
          ? {
              id: result.invoice.id,
              number: result.invoice.number,
              amountMinor: result.invoice.amountMinor.toString(),
              currency: result.invoice.currency,
              dueAt: result.invoice.dueAt,
            }
          : null,
        message: result.paymentRequired
          ? "Invoice created. Complete manual or SSLCOMMERZ payment to activate the plan."
          : "Free plan request recorded for platform administrator approval.",
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/change-currency",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);
    const input = z
      .object({
        currency: currencySchema,
        interval: intervalSchema.optional(),
      })
      .parse(req.body);

    const current = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: req.auth!.workspaceId },
    });

    if (!current) {
      throw new AppError(
        503,
        "BILLING_NOT_CONFIGURED",
        "Workspace billing is not configured.",
      );
    }

    const change = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const previousChanges = await tx.subscriptionChange.findMany({
        where: {
          workspaceId: req.auth!.workspaceId,
          status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] },
        },
        select: { id: true },
      });
      const changeIds = previousChanges.map((item) => item.id);

      if (changeIds.length > 0) {
        const invoices = await tx.billingInvoice.findMany({
          where: {
            subscriptionChangeId: { in: changeIds },
            status: "OPEN",
          },
          select: { id: true },
        });
        const invoiceIds = invoices.map((item) => item.id);
        if (invoiceIds.length > 0) {
          await tx.paymentAttempt.updateMany({
            where: {
              invoiceId: { in: invoiceIds },
              status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] },
            },
            data: {
              status: "CANCELLED",
              completedAt: now,
              failureReason: "Superseded by a newer currency request.",
            },
          });
          await tx.billingInvoice.updateMany({
            where: { id: { in: invoiceIds } },
            data: { status: "VOID", voidedAt: now },
          });
        }
        await tx.subscriptionChange.updateMany({
          where: { id: { in: changeIds } },
          data: {
            status: "CANCELLED",
            reviewedAt: now,
            note: "Superseded by a newer currency request.",
          },
        });
      }

      return tx.subscriptionChange.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          requestedById: req.auth!.userId,
          requestedPlanVersionId: current.planVersionId,
          currency: input.currency,
          interval: input.interval ?? current.interval,
          effectiveAt: current.periodEnd,
        },
      });
    });

    res.status(202).json({
      data: change,
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/cancel-change",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const result = await prisma.$transaction(async (tx) => {
      const changes = await tx.subscriptionChange.findMany({
        where: {
          workspaceId: req.auth!.workspaceId,
          status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] },
        },
        select: { id: true },
      });
      const ids = changes.map((item) => item.id);
      if (ids.length === 0) return 0;

      const now = new Date();
      const updated = await tx.subscriptionChange.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "CANCELLED",
          reviewedAt: now,
          note: "Cancelled by workspace.",
        },
      });
      const invoices = await tx.billingInvoice.findMany({
        where: { subscriptionChangeId: { in: ids }, status: "OPEN" },
        select: { id: true },
      });
      const invoiceIds = invoices.map((item) => item.id);
      if (invoiceIds.length > 0) {
        await tx.paymentAttempt.updateMany({
          where: {
            invoiceId: { in: invoiceIds },
            status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] },
          },
          data: {
            status: "CANCELLED",
            completedAt: now,
            failureReason: "Plan request cancelled by workspace.",
          },
        });
        await tx.billingInvoice.updateMany({
          where: { id: { in: invoiceIds } },
          data: { status: "VOID", voidedAt: now },
        });
      }
      return updated.count;
    });

    res.json({
      data: { cancelled: result },
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    const alerts = await prisma.usageAlert.findMany({
      where: { workspaceId: req.auth!.workspaceId },
      orderBy: { triggeredAt: "desc" },
      take: 100,
    });

    res.json({
      data: alerts.map((alert) => ({
        id: alert.id,
        metric: alert.metric,
        threshold: alert.threshold,
        periodStart: alert.periodStart,
        periodEnd: alert.periodEnd,
        triggeredAt: alert.triggeredAt,
        acknowledgedAt: alert.acknowledgedAt,
        emailStatus: alert.emailStatus,
        emailRecipient: alert.emailRecipient,
        emailSentAt: alert.emailSentAt,
        lastEmailAttemptAt: alert.lastEmailAttemptAt,
        emailLastError: alert.emailLastError,
      })),
      meta: { requestId: req.id },
    });
  }),
);

router.patch(
  "/alerts/:alertId",
  asyncHandler(async (req, res) => {
    const alertId = z.string().cuid().parse(req.params.alertId);
    const result = await prisma.usageAlert.updateMany({
      where: {
        id: alertId,
        workspaceId: req.auth!.workspaceId,
      },
      data: { acknowledgedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new AppError(
        404,
        "USAGE_ALERT_NOT_FOUND",
        "Usage alert was not found.",
      );
    }

    res.status(204).send();
  }),
);

export default router;
