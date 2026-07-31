import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { env } from "../../config/env.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import {
  activatePrepaidRevenueModel,
  activateSubscriptionRevenueModel,
  createSubscriptionOfferInvoice,
  createWalletTopupInvoice,
  minimumTopupMinor,
} from "./revenue.service.js";
import { paygEligibleMetrics } from "./payg.service.js";

const router = Router();
router.use(authenticate, requireUser);

const currencySchema = z.enum(["BDT", "USD"]);
const termSchema = z.enum(["FREE", "THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"]);
const metricSchema = z.enum(paygEligibleMetrics);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
  "/revenue-options",
  asyncHandler(async (req, res) => {
    const workspaceId = req.auth!.workspaceId;
    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId },
      include: {
        planVersion: {
          include: {
            plan: true,
            entitlements: {
              where: { metric: { in: [...paygEligibleMetrics] } },
              orderBy: { metric: "asc" },
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

    const [preference, wallet, offers, inquiry, paygPolicy] = await Promise.all(
      [
        prisma.billingPreference.findUnique({ where: { workspaceId } }),
        prisma.prepaidWallet.findUnique({ where: { workspaceId } }),
        prisma.plan.findMany({
          where: { isPublic: true, isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            versions: {
              where: { publishedAt: { not: null }, retiredAt: null },
              orderBy: { version: "desc" },
              take: 1,
              include: {
                offers: {
                  where: {
                    currency: subscription.currency,
                    isPublic: true,
                    isActive: true,
                  },
                  orderBy: { amountMinor: "asc" },
                },
                entitlements: { orderBy: { metric: "asc" } },
              },
            },
          },
        }),
        prisma.enterpriseInquiry.findFirst({
          where: {
            workspaceId,
            status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.paygPolicy.findUnique({
          where: { workspaceId },
          include: {
            metrics: { orderBy: { metric: "asc" } },
          },
        }),
      ],
    );

    res.json({
      data: {
        current: {
          revenueModel: preference?.revenueModel ?? subscription.revenueModel,
          subscriptionTerm:
            preference?.subscriptionTerm ?? subscription.subscriptionTerm,
          currency: subscription.currency,
          planCode: subscription.planVersion.plan.code,
          planName: subscription.planVersion.plan.name,
          commitmentEndsAt: subscription.commitmentEndsAt,
        },
        minimumTopupMinor: minimumTopupMinor(subscription.currency).toString(),
        wallet: wallet
          ? {
              id: wallet.id,
              currency: wallet.currency,
              status: wallet.status,
              balanceMinor: wallet.balanceMinor.toString(),
              reservedMinor: wallet.reservedMinor.toString(),
              availableMinor: (
                wallet.balanceMinor - wallet.reservedMinor
              ).toString(),
              lowBalanceThresholdMinor:
                wallet.lowBalanceThresholdMinor.toString(),
            }
          : null,
        offers: offers.flatMap((plan) => {
          const version = plan.versions[0];
          if (!version) return [];
          return [
            {
              id: plan.id,
              code: plan.code,
              name: plan.name,
              description: plan.description,
              versionId: version.id,
              offers: version.offers.map((offer) => ({
                id: offer.id,
                term: offer.term,
                currency: offer.currency,
                amountMinor: offer.amountMinor.toString(),
              })),
              entitlements: version.entitlements.map((item) => ({
                metric: item.metric,
                includedAmount: item.includedAmount.toString(),
              })),
            },
          ];
        }),
        paygMetrics: subscription.planVersion.entitlements.map((item) => ({
          metric: item.metric,
          overageUnit: item.overageUnit?.toString() ?? null,
          overagePriceMinor:
            subscription.currency === "BDT"
              ? (item.overageBdtMinor?.toString() ?? null)
              : (item.overageUsdMinor?.toString() ?? null),
          selectable: Boolean(
            item.overageUnit &&
            (subscription.currency === "BDT"
              ? item.overageBdtMinor
              : item.overageUsdMinor),
          ),
        })),
        enterpriseInquiry: inquiry,
        paygPolicy: paygPolicy
          ? {
              id: paygPolicy.id,
              status: paygPolicy.status,
              currency: paygPolicy.currency,
              metrics: paygPolicy.metrics.map((item) => ({
                metric: item.metric,
                enabled: item.enabled,
                metricSpendCapMinor:
                  item.metricSpendCapMinor?.toString() ?? null,
              })),
            }
          : null,
      },
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/wallet",
  asyncHandler(async (req, res) => {
    const wallet = await prisma.prepaidWallet.findUnique({
      where: { workspaceId: req.auth!.workspaceId },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            invoice: {
              select: {
                id: true,
                number: true,
                status: true,
              },
            },
          },
        },
      },
    });

    res.json({
      data: wallet
        ? {
            id: wallet.id,
            currency: wallet.currency,
            status: wallet.status,
            balanceMinor: wallet.balanceMinor.toString(),
            reservedMinor: wallet.reservedMinor.toString(),
            availableMinor: (
              wallet.balanceMinor - wallet.reservedMinor
            ).toString(),
            lowBalanceThresholdMinor:
              wallet.lowBalanceThresholdMinor.toString(),
            transactions: wallet.transactions.map((item) => ({
              ...item,
              amountMinor: item.amountMinor.toString(),
              balanceAfterMinor: item.balanceAfterMinor.toString(),
            })),
          }
        : null,
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/wallet/topups",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z
      .object({
        currency: currencySchema,
        amountMinor: z.coerce.bigint().positive(),
      })
      .parse(req.body);

    const invoice = await prisma.$transaction((tx) =>
      createWalletTopupInvoice(tx, {
        workspaceId: req.auth!.workspaceId,
        requestedById: req.auth!.userId,
        currency: input.currency,
        amountMinor: input.amountMinor,
      }),
    );

    res.status(201).json({
      data: {
        invoiceId: invoice.id,
        number: invoice.number,
        currency: invoice.currency,
        amountMinor: invoice.amountMinor.toString(),
        status: invoice.status,
        dueAt: invoice.dueAt,
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/subscription-offers/select",
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
        term: termSchema,
      })
      .parse(req.body);

    if (input.planCode === "FREE" && input.term !== "FREE") {
      throw new AppError(
        422,
        "FREE_TERM_INVALID",
        "The Free plan uses the Free term.",
      );
    }

    if (input.planCode !== "FREE" && input.term === "FREE") {
      throw new AppError(
        422,
        "PAID_TERM_REQUIRED",
        "Choose 3 months, 6 months or 1 year.",
      );
    }

    const result = await prisma.$transaction((tx) =>
      createSubscriptionOfferInvoice(tx, {
        workspaceId: req.auth!.workspaceId,
        requestedById: req.auth!.userId,
        planCode: input.planCode,
        currency: input.currency,
        term: input.term,
      }),
    );

    res.status(202).json({
      data: {
        changeId: result.change.id,
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
      },
      meta: { requestId: req.id },
    });
  }),
);

router.patch(
  "/revenue-model",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z
      .discriminatedUnion("revenueModel", [
        z.object({
          revenueModel: z.literal("SUBSCRIPTION"),
        }),
        z.object({
          revenueModel: z.literal("PREPAID_PAYG"),
          currency: currencySchema,
          metrics: z
            .array(
              z.object({
                metric: metricSchema,
                metricSpendCapMinor: z.coerce
                  .bigint()
                  .positive()
                  .nullable()
                  .optional(),
              }),
            )
            .min(1)
            .max(paygEligibleMetrics.length),
        }),
      ])
      .parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      if (input.revenueModel === "SUBSCRIPTION") {
        return activateSubscriptionRevenueModel(tx, {
          workspaceId: req.auth!.workspaceId,
          userId: req.auth!.userId,
        });
      }

      const subscription = await tx.workspaceSubscription.findUnique({
        where: { workspaceId: req.auth!.workspaceId },
        include: {
          planVersion: { include: { entitlements: true } },
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
          "PAYG_CURRENCY_MISMATCH",
          "PAYG currency must match the workspace billing currency.",
        );
      }

      const entitlementMap = new Map(
        subscription.planVersion.entitlements.map((item) => [
          item.metric,
          item,
        ]),
      );

      for (const item of input.metrics) {
        const entitlement = entitlementMap.get(item.metric);
        const price =
          input.currency === "BDT"
            ? entitlement?.overageBdtMinor
            : entitlement?.overageUsdMinor;

        if (!entitlement?.overageUnit || !price) {
          throw new AppError(
            422,
            "PAYG_METRIC_NOT_PRICED",
            `${item.metric} does not have an active PAYG price.`,
          );
        }
      }

      return activatePrepaidRevenueModel(tx, {
        workspaceId: req.auth!.workspaceId,
        userId: req.auth!.userId,
        currency: input.currency,
        enabledMetrics: input.metrics,
      });
    });

    res.json({
      data: result,
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/enterprise-inquiries",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z
      .object({
        companyName: z.string().trim().min(2).max(160),
        contactName: z.string().trim().min(2).max(120),
        email: z.string().trim().email(),
        phone: z.string().trim().min(6).max(40).nullable().optional(),
        expectedStorageBytes: z.coerce
          .bigint()
          .positive()
          .nullable()
          .optional(),
        expectedDeliveryBytes: z.coerce
          .bigint()
          .positive()
          .nullable()
          .optional(),
        expectedMonthlyRequests: z.coerce
          .bigint()
          .positive()
          .nullable()
          .optional(),
        teamSize: z.coerce
          .number()
          .int()
          .positive()
          .max(100000)
          .nullable()
          .optional(),
        message: z.string().trim().max(3000).nullable().optional(),
      })
      .parse(req.body);

    const existing = await prisma.enterpriseInquiry.findFirst({
      where: {
        workspaceId: req.auth!.workspaceId,
        status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
      },
    });

    if (existing) {
      throw new AppError(
        409,
        "ENTERPRISE_INQUIRY_EXISTS",
        "An active Enterprise inquiry already exists for this workspace.",
      );
    }

    const inquiry = await prisma.$transaction(async (tx) => {
      const created = await tx.enterpriseInquiry.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          createdById: req.auth!.userId,
          ...input,
        },
      });

      await tx.billingPreference.upsert({
        where: { workspaceId: req.auth!.workspaceId },
        create: {
          workspaceId: req.auth!.workspaceId,
          revenueModel: "ENTERPRISE_CUSTOM",
          subscriptionTerm: "ENTERPRISE_CUSTOM",
        },
        update: {
          revenueModel: "ENTERPRISE_CUSTOM",
          subscriptionTerm: "ENTERPRISE_CUSTOM",
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          actorId: req.auth!.userId,
          action: "billing.enterprise_inquiry_created",
          entityType: "EnterpriseInquiry",
          entityId: created.id,
          metadata: {
            companyName: input.companyName,
            email: input.email,
          },
        },
      });

      return created;
    });

    const detailLines = [
      `Company: ${inquiry.companyName}`,
      `Contact: ${inquiry.contactName}`,
      `Email: ${inquiry.email}`,
      inquiry.phone ? `Phone: ${inquiry.phone}` : null,
      inquiry.teamSize ? `Team size: ${inquiry.teamSize}` : null,
      inquiry.message ? `Requirements: ${inquiry.message}` : null,
    ].filter((value): value is string => Boolean(value));
    const details = detailLines.join("\n");
    const detailsHtml = detailLines
      .map((value) => escapeHtml(value))
      .join("<br />");

    void Promise.all([
      sendSecurityEmail({
        to: env.ENTERPRISE_SALES_EMAIL,
        subject: `New Enterprise inquiry: ${inquiry.companyName}`,
        text:
          `A new Enterprise inquiry was submitted.\n\n${details}\n\n` +
          `Inquiry ID: ${inquiry.id}`,
        html:
          `<p>A new Enterprise inquiry was submitted.</p>` +
          `<p>${detailsHtml}</p>` +
          `<p>Inquiry ID: <code>${escapeHtml(inquiry.id)}</code></p>`,
      }),
      sendSecurityEmail({
        to: inquiry.email,
        subject: "We received your Enterprise request",
        text:
          `Hello ${inquiry.contactName},\n\n` +
          `We received the Enterprise request for ${inquiry.companyName}. ` +
          `Our sales team will review the requested capacity and contact you.`,
        html:
          `<p>Hello ${escapeHtml(inquiry.contactName)},</p>` +
          `<p>We received the Enterprise request for <strong>${escapeHtml(inquiry.companyName)}</strong>. ` +
          `Our sales team will review the requested capacity and contact you.</p>`,
      }),
    ]).catch((error) => {
      console.error("Enterprise inquiry email failed:", error);
    });

    res.status(201).json({
      data: inquiry,
      meta: { requestId: req.id },
    });
  }),
);

export default router;
