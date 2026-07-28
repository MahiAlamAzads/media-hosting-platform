import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import {
  authenticate,
  requireUser
} from "../../middleware/authenticate.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import {
  createStripeSetupCheckout,
  detachStripePaymentMethod
} from "../payments/stripe-payg.service.js";
import {
  ensureStripeCustomer,
  setDefaultPaymentMethod,
  syncStripeSetupSession
} from "./payg-payment-method.service.js";
import {
  isPaygEligibleMetric,
  paygEligibleMetrics
} from "./payg.service.js";
import {
  chargePendingPaygForWorkspace
} from "./payg-charge.service.js";

const router = Router();
router.use(authenticate, requireUser);

const currencySchema = z.enum(["BDT", "USD"]);
const metricSchema = z.enum(paygEligibleMetrics);

function requireBillingManager(role: "OWNER" | "ADMIN" | "MEMBER"): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError(
      403,
      "BILLING_PERMISSION_REQUIRED",
      "Workspace owner or admin access is required."
    );
  }
}

function serializeMethod(method: {
  id: string;
  provider: "STRIPE" | "SSLCOMMERZ";
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  cardholderName: string | null;
  billingEmail: string | null;
  status: string;
  isDefault: boolean;
  consentAt: Date;
  createdAt: Date;
}) {
  return {
    id: method.id,
    provider: method.provider,
    brand: method.brand,
    last4: method.last4,
    expMonth: method.expMonth,
    expYear: method.expYear,
    cardholderName: method.cardholderName,
    billingEmail: method.billingEmail,
    status: method.status,
    isDefault: method.isDefault,
    consentAt: method.consentAt,
    createdAt: method.createdAt
  };
}

router.get(
  "/payg",
  asyncHandler(async (req, res) => {
    const workspaceId = req.auth!.workspaceId;

    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId },
      include: {
        planVersion: {
          include: {
            plan: true,
            entitlements: {
              where: {
                metric: { in: [...paygEligibleMetrics] }
              },
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

    const [policy, methods, spend, charges, ledgerByMetric] = await Promise.all([
      prisma.paygPolicy.findUnique({
        where: { workspaceId },
        include: {
          metrics: { orderBy: { metric: "asc" } }
        }
      }),
      prisma.savedPaymentMethod.findMany({
        where: {
          workspaceId,
          removedAt: null
        },
        orderBy: [
          { isDefault: "desc" },
          { createdAt: "desc" }
        ]
      }),
      prisma.paygLedgerEntry.aggregate({
        where: {
          workspaceId,
          periodStart: subscription.periodStart,
          periodEnd: subscription.periodEnd,
          status: { in: ["PENDING", "CHARGED"] }
        },
        _sum: { amountMinor: true }
      }),
      prisma.paygChargeAttempt.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amountMinor: true,
          currency: true,
          status: true,
          failureCode: true,
          failureReason: true,
          initiatedAt: true,
          completedAt: true,
          periodStart: true,
          periodEnd: true,
          createdAt: true,
          paymentMethod: {
            select: {
              provider: true,
              brand: true,
              last4: true
            }
          }
        }
      }),
      prisma.paygLedgerEntry.groupBy({
        by: ["metric", "status"],
        where: {
          workspaceId,
          periodStart: subscription.periodStart,
          periodEnd: subscription.periodEnd
        },
        _sum: {
          quantity: true,
          amountMinor: true
        }
      })
    ]);

    const defaults = subscription.currency === "BDT"
      ? {
          monthlySpendCapMinor:
            BigInt(env.PAYG_DEFAULT_MONTHLY_CAP_BDT_MINOR),
          chargeThresholdMinor:
            BigInt(env.PAYG_DEFAULT_CHARGE_THRESHOLD_BDT_MINOR)
        }
      : {
          monthlySpendCapMinor:
            BigInt(env.PAYG_DEFAULT_MONTHLY_CAP_USD_MINOR),
          chargeThresholdMinor:
            BigInt(env.PAYG_DEFAULT_CHARGE_THRESHOLD_USD_MINOR)
        };

    res.json({
      data: {
        available: env.PAYG_ENABLED,
        configuredProvider: env.PAYG_CARD_PROVIDER,
        stripeConfigured: env.STRIPE_PAYG_ENABLED,
        sslcommerzCardOnFileConfigured: false,
        subscription: {
          planCode: subscription.planVersion.plan.code,
          planName: subscription.planVersion.plan.name,
          currency: subscription.currency,
          periodStart: subscription.periodStart,
          periodEnd: subscription.periodEnd
        },
        policy: policy
          ? {
              id: policy.id,
              status: policy.status,
              currency: policy.currency,
              monthlySpendCapMinor:
                policy.monthlySpendCapMinor.toString(),
              chargeThresholdMinor:
                policy.chargeThresholdMinor.toString(),
              defaultPaymentMethodId:
                policy.defaultPaymentMethodId,
              consentAt: policy.consentAt,
              pausedAt: policy.pausedAt,
              pauseReason: policy.pauseReason,
              metrics: policy.metrics.map(item => ({
                metric: item.metric,
                enabled: item.enabled,
                metricSpendCapMinor:
                  item.metricSpendCapMinor?.toString() ?? null
              }))
            }
          : {
              status: "DISABLED",
              currency: subscription.currency,
              monthlySpendCapMinor:
                defaults.monthlySpendCapMinor.toString(),
              chargeThresholdMinor:
                defaults.chargeThresholdMinor.toString(),
              defaultPaymentMethodId: null,
              consentAt: null,
              pausedAt: null,
              pauseReason: null,
              metrics: []
            },
        currentSpendMinor:
          (spend._sum.amountMinor ?? 0n).toString(),
        paymentMethods: methods.map(serializeMethod),
        chargeAttempts: charges.map(item => ({
          ...item,
          amountMinor: item.amountMinor.toString()
        })),
        ledgerByMetric: ledgerByMetric.map(item => ({
          metric: item.metric,
          status: item.status,
          quantity: (item._sum.quantity ?? 0n).toString(),
          amountMinor: (item._sum.amountMinor ?? 0n).toString()
        })),
        metrics: subscription.planVersion.entitlements.map(
          entitlement => ({
            metric: entitlement.metric,
            includedAmount:
              entitlement.includedAmount.toString(),
            overageUnit:
              entitlement.overageUnit?.toString() ?? null,
            overagePriceMinor:
              subscription.currency === "BDT"
                ? entitlement.overageBdtMinor?.toString() ?? null
                : entitlement.overageUsdMinor?.toString() ?? null,
            selectable:
              isPaygEligibleMetric(entitlement.metric) &&
              Boolean(entitlement.overageUnit) &&
              Boolean(
                subscription.currency === "BDT"
                  ? entitlement.overageBdtMinor
                  : entitlement.overageUsdMinor
              )
          })
        )
      },
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/payment-methods/setup-session",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z.object({
      provider: z.enum(["STRIPE", "SSLCOMMERZ"]).default(
        env.PAYG_CARD_PROVIDER
      ),
      consentAccepted: z.literal(true)
    }).parse(req.body);

    if (!env.PAYG_ENABLED) {
      throw new AppError(
        503,
        "PAYG_DISABLED",
        "Pay as you go is currently disabled."
      );
    }

    if (input.provider === "SSLCOMMERZ") {
      throw new AppError(
        501,
        "SSLCOMMERZ_CARD_ON_FILE_UNAVAILABLE",
        "SSLCOMMERZ merchant recurring-token API approval is required before card-on-file charging can be enabled."
      );
    }

    if (!env.STRIPE_PAYG_ENABLED) {
      throw new AppError(
        503,
        "STRIPE_PAYG_DISABLED",
        "Stripe saved-card setup is not configured."
      );
    }

    const [workspace, preference] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: req.auth!.workspaceId },
        select: { name: true }
      }),
      prisma.billingPreference.findUnique({
        where: { workspaceId: req.auth!.workspaceId },
        select: { billingEmail: true }
      })
    ]);

    const customer = await ensureStripeCustomer({
      workspaceId: req.auth!.workspaceId,
      workspaceName: workspace?.name,
      billingEmail: preference?.billingEmail
    });

    const session = await createStripeSetupCheckout({
      customerId: customer.providerCustomerId,
      workspaceId: req.auth!.workspaceId
    });

    if (!session.url) {
      throw new AppError(
        502,
        "STRIPE_SETUP_URL_MISSING",
        "Stripe did not return a hosted setup URL."
      );
    }

    res.status(201).json({
      data: {
        provider: "STRIPE",
        sessionId: String(session.id),
        url: String(session.url)
      },
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/payment-methods/sync",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z.object({
      sessionId: z.string().min(8).max(255)
    }).parse(req.body);

    const result = await syncStripeSetupSession(
      input.sessionId,
      req.auth!.workspaceId
    );

    res.json({
      data: {
        paymentMethodId: result.paymentMethodId
      },
      meta: { requestId: req.id }
    });
  })
);

router.patch(
  "/payment-methods/:paymentMethodId/default",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);
    const paymentMethodId = z
      .string()
      .cuid()
      .parse(req.params.paymentMethodId);

    await prisma.$transaction(tx =>
      setDefaultPaymentMethod(
        tx,
        req.auth!.workspaceId,
        paymentMethodId
      )
    );

    res.status(204).send();
  })
);

router.delete(
  "/payment-methods/:paymentMethodId",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);
    const paymentMethodId = z
      .string()
      .cuid()
      .parse(req.params.paymentMethodId);

    const method = await prisma.savedPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        workspaceId: req.auth!.workspaceId,
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

    if (method.isDefault) {
      const pendingUsage = await prisma.paygLedgerEntry.count({
        where: {
          workspaceId: req.auth!.workspaceId,
          status: "PENDING",
          chargeAttemptId: null
        }
      });

      if (pendingUsage > 0) {
        throw new AppError(
          409,
          "PAYG_BALANCE_PENDING",
          "Charge or settle pending PAYG usage before removing the default card."
        );
      }
    }

    if (method.provider === "STRIPE") {
      await detachStripePaymentMethod(
        method.providerPaymentMethodId
      );
    }

    await prisma.$transaction(async tx => {
      await tx.savedPaymentMethod.update({
        where: { id: method.id },
        data: {
          status: "REMOVED",
          isDefault: false,
          removedAt: new Date()
        }
      });

      await tx.paygPolicy.updateMany({
        where: {
          workspaceId: req.auth!.workspaceId,
          defaultPaymentMethodId: method.id
        },
        data: {
          status: "PAUSED_PAYMENT_FAILED",
          defaultPaymentMethodId: null,
          pausedAt: new Date(),
          pauseReason: "The default saved payment method was removed."
        }
      });
    });

    res.status(204).send();
  })
);

router.patch(
  "/payg",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    const input = z.object({
      enabled: z.boolean(),
      currency: currencySchema,
      monthlySpendCapMinor: z.coerce.bigint().positive(),
      chargeThresholdMinor: z.coerce.bigint().positive(),
      defaultPaymentMethodId:
        z.string().cuid().nullable(),
      consentAccepted: z.boolean(),
      metrics: z.array(
        z.object({
          metric: metricSchema,
          enabled: z.boolean(),
          metricSpendCapMinor:
            z.coerce.bigint().positive().nullable().optional()
        })
      ).max(paygEligibleMetrics.length)
    }).parse(req.body);

    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: req.auth!.workspaceId },
      include: {
        planVersion: {
          include: { entitlements: true }
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

    if (input.currency !== subscription.currency) {
      throw new AppError(
        409,
        "PAYG_CURRENCY_MISMATCH",
        "PAYG currency must match the active subscription."
      );
    }

    if (
      input.chargeThresholdMinor >
      input.monthlySpendCapMinor
    ) {
      throw new AppError(
        422,
        "PAYG_THRESHOLD_INVALID",
        "The charge threshold cannot exceed the monthly spend cap."
      );
    }

    const enabledMetrics = input.metrics.filter(item => item.enabled);
    const entitlementMap = new Map(
      subscription.planVersion.entitlements.map(item => [
        item.metric,
        item
      ])
    );

    for (const item of enabledMetrics) {
      const entitlement = entitlementMap.get(item.metric);
      const price = input.currency === "BDT"
        ? entitlement?.overageBdtMinor
        : entitlement?.overageUsdMinor;

      if (
        !entitlement ||
        !entitlement.overageUnit ||
        !price
      ) {
        throw new AppError(
          422,
          "PAYG_METRIC_NOT_PRICED",
          `${item.metric} does not have an overage price.`
        );
      }
    }

    if (input.enabled) {
      if (!env.PAYG_ENABLED) {
        throw new AppError(
          503,
          "PAYG_DISABLED",
          "Pay as you go is currently disabled."
        );
      }

      if (!input.consentAccepted) {
        throw new AppError(
          422,
          "PAYG_CONSENT_REQUIRED",
          "Consent is required for automatic off-session charges."
        );
      }

      if (!input.defaultPaymentMethodId) {
        throw new AppError(
          422,
          "PAYMENT_METHOD_REQUIRED",
          "A saved payment method is required."
        );
      }

      if (enabledMetrics.length === 0) {
        throw new AppError(
          422,
          "PAYG_METRIC_REQUIRED",
          "Select at least one PAYG metric."
        );
      }

      const method = await prisma.savedPaymentMethod.findFirst({
        where: {
          id: input.defaultPaymentMethodId,
          workspaceId: req.auth!.workspaceId,
          status: "ACTIVE",
          removedAt: null
        }
      });

      if (!method) {
        throw new AppError(
          422,
          "PAYMENT_METHOD_INVALID",
          "The selected saved payment method is not active."
        );
      }
    }

    const policy = await prisma.$transaction(async tx => {
      const saved = await tx.paygPolicy.upsert({
        where: { workspaceId: req.auth!.workspaceId },
        create: {
          workspaceId: req.auth!.workspaceId,
          status: input.enabled ? "ACTIVE" : "DISABLED",
          currency: input.currency,
          monthlySpendCapMinor:
            input.monthlySpendCapMinor,
          chargeThresholdMinor:
            input.chargeThresholdMinor,
          defaultPaymentMethodId:
            input.defaultPaymentMethodId,
          consentVersion: "payg-off-session-v1",
          consentAt: input.enabled ? new Date() : null,
          pausedAt: null,
          pauseReason: null
        },
        update: {
          status: input.enabled ? "ACTIVE" : "DISABLED",
          currency: input.currency,
          monthlySpendCapMinor:
            input.monthlySpendCapMinor,
          chargeThresholdMinor:
            input.chargeThresholdMinor,
          defaultPaymentMethodId:
            input.defaultPaymentMethodId,
          consentVersion: "payg-off-session-v1",
          consentAt: input.enabled ? new Date() : undefined,
          pausedAt: null,
          pauseReason: null
        }
      });

      await tx.paygMetricSetting.deleteMany({
        where: { policyId: saved.id }
      });

      if (input.metrics.length > 0) {
        await tx.paygMetricSetting.createMany({
          data: input.metrics.map(item => ({
            policyId: saved.id,
            metric: item.metric,
            enabled: item.enabled,
            metricSpendCapMinor:
              item.metricSpendCapMinor ?? null
          }))
        });
      }

      if (input.defaultPaymentMethodId) {
        await setDefaultPaymentMethod(
          tx,
          req.auth!.workspaceId,
          input.defaultPaymentMethodId
        );
      }

      if (input.enabled) {
        await tx.paygLedgerEntry.updateMany({
          where: {
            workspaceId: req.auth!.workspaceId,
            status: "FAILED",
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd
          },
          data: {
            status: "PENDING",
            chargeAttemptId: null
          }
        });
      } else {
        await tx.paygAuthorization.updateMany({
          where: {
            workspaceId: req.auth!.workspaceId,
            status: "ACTIVE"
          },
          data: {
            status: "RELEASED",
            releasedAt: new Date()
          }
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          actorId: req.auth!.userId,
          action: input.enabled
            ? "billing.payg_enabled"
            : "billing.payg_disabled",
          entityType: "PaygPolicy",
          entityId: saved.id,
          metadata: {
            currency: input.currency,
            monthlySpendCapMinor:
              input.monthlySpendCapMinor.toString(),
            chargeThresholdMinor:
              input.chargeThresholdMinor.toString(),
            enabledMetrics:
              enabledMetrics.map(item => item.metric)
          }
        }
      });

      return saved;
    });

    await chargePendingPaygForWorkspace(
      req.auth!.workspaceId,
      true
    );

    const responseStatus = (
      await prisma.paygPolicy.findUnique({
        where: { workspaceId: req.auth!.workspaceId },
        select: { status: true }
      })
    )?.status ?? policy.status;

    res.json({
      data: {
        id: policy.id,
        status: responseStatus
      },
      meta: { requestId: req.id }
    });
  })
);

export default router;
