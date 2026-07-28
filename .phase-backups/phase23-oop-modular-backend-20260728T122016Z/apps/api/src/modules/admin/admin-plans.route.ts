import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import {
  authenticate,
  requireUser
} from "../../middleware/authenticate.js";
import { requirePlatformAdmin } from "../../middleware/platform-admin.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import {
  getPeriodBounds,
  getSubscriptionCommitmentBounds,
  subscriptionTermToInterval
} from "../billing/billing.utils.js";
import { usageMetrics } from "../billing/billing.types.js";
import { ensurePrepaidWalletInTransaction } from "../billing/revenue.service.js";
import { invalidatePublicPricingCache } from "../billing/billing.service.js";

const router = Router();
router.use(authenticate, requireUser, requirePlatformAdmin);

router.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  res.once("finish", () => {
    if (res.statusCode < 400) {
      void invalidatePublicPricingCache();
    }
  });

  next();
});

const routeIdSchema = z.string().min(1).max(100);
const moneySchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative()
]).transform(value => BigInt(value));
const amountSchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative()
]).transform(value => BigInt(value));

const entitlementSchema = z.object({
  metric: z.enum(usageMetrics),
  includedAmount: amountSchema,
  hardLimit: z.boolean().default(true),
  overageAllowed: z.boolean().default(false),
  overageUnit: amountSchema.nullable().optional(),
  overageBdtMinor: moneySchema.nullable().optional(),
  overageUsdMinor: moneySchema.nullable().optional()
}).superRefine((value, context) => {
  if (!value.overageAllowed) return;

  if (!value.overageUnit || value.overageUnit <= 0n) {
    context.addIssue({
      code: "custom",
      path: ["overageUnit"],
      message: "Overage unit must be greater than zero."
    });
  }

  if (value.overageBdtMinor === null || value.overageBdtMinor === undefined) {
    context.addIssue({
      code: "custom",
      path: ["overageBdtMinor"],
      message: "BDT overage price is required."
    });
  }

  if (value.overageUsdMinor === null || value.overageUsdMinor === undefined) {
    context.addIssue({
      code: "custom",
      path: ["overageUsdMinor"],
      message: "USD overage price is required."
    });
  }
});

router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const plans = await prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        versions: {
          orderBy: { version: "desc" },
          include: {
            prices: true,
            offers: { orderBy: [{ currency: "asc" }, { term: "asc" }] },
            entitlements: { orderBy: { metric: "asc" } },
            _count: { select: { subscriptions: true } }
          }
        }
      }
    });

    res.json({
      data: plans.map(plan => ({
        ...plan,
        versions: plan.versions.map(version => ({
          ...version,
          prices: version.prices.map(price => ({
            ...price,
            amountMinor: price.amountMinor.toString()
          })),
          offers: version.offers.map(offer => ({
            ...offer,
            amountMinor: offer.amountMinor.toString()
          })),
          entitlements: version.entitlements.map(item => ({
            ...item,
            includedAmount: item.includedAmount.toString(),
            overageUnit: item.overageUnit?.toString() ?? null,
            overageBdtMinor: item.overageBdtMinor?.toString() ?? null,
            overageUsdMinor: item.overageUsdMinor?.toString() ?? null
          }))
        }))
      })),
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/plans",
  asyncHandler(async (req, res) => {
    const input = z.object({
      code: z.string().trim().min(2).max(40)
        .regex(/^[A-Z0-9_]+$/),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).nullable().optional(),
      isPublic: z.boolean().default(true),
      isActive: z.boolean().default(true),
      sortOrder: z.number().int().min(0).max(10_000).default(100)
    }).parse(req.body);

    const plan = await prisma.plan.create({ data: input });

    res.status(201).json({
      data: plan,
      meta: { requestId: req.id }
    });
  })
);

router.patch(
  "/plans/:planId",
  asyncHandler(async (req, res) => {
    const planId = routeIdSchema.parse(req.params.planId);
    const input = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      isPublic: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(10_000).optional()
    }).refine(value => Object.keys(value).length > 0, {
      message: "At least one field is required."
    }).parse(req.body);

    const result = await prisma.plan.updateMany({
      where: { id: planId },
      data: input
    });

    if (result.count !== 1) {
      throw new AppError(404, "PLAN_NOT_FOUND", "Plan was not found.");
    }

    res.status(204).send();
  })
);

router.post(
  "/plans/:planId/versions",
  asyncHandler(async (req, res) => {
    const planId = routeIdSchema.parse(req.params.planId);
    const input = z.object({
      effectiveAt: z.coerce.date().default(() => new Date()),
      prices: z.array(z.object({
        currency: z.enum(["BDT", "USD"]),
        interval: z.enum(["MONTHLY", "YEARLY"]),
        amountMinor: moneySchema,
        isActive: z.boolean().default(true)
      })).length(4),
      entitlements: z.array(entitlementSchema)
        .length(usageMetrics.length)
    }).superRefine((value, context) => {
      const priceKeys = new Set(
        value.prices.map(price => `${price.currency}:${price.interval}`)
      );
      if (priceKeys.size !== 4) {
        context.addIssue({
          code: "custom",
          path: ["prices"],
          message: "Provide one BDT/USD monthly/yearly price."
        });
      }

      const metricKeys = new Set(
        value.entitlements.map(item => item.metric)
      );
      if (metricKeys.size !== usageMetrics.length) {
        context.addIssue({
          code: "custom",
          path: ["entitlements"],
          message: "Provide every usage metric exactly once."
        });
      }
    }).parse(req.body);

    const created = await prisma.$transaction(async tx => {
      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: {
          id: true,
          code: true,
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { version: true }
          }
        }
      });

      if (!plan) {
        throw new AppError(404, "PLAN_NOT_FOUND", "Plan was not found.");
      }

      const price = (
        currency: "BDT" | "USD",
        interval: "MONTHLY" | "YEARLY"
      ) => {
        const item = input.prices.find(
          value =>
            value.currency === currency &&
            value.interval === interval
        );
        if (!item) {
          throw new AppError(
            422,
            "PLAN_PRICE_MISSING",
            `Missing ${currency} ${interval} price.`
          );
        }
        return item.amountMinor;
      };

      const offers = plan.code === "FREE"
        ? (["BDT", "USD"] as const).map(currency => ({
            currency,
            term: "FREE" as const,
            amountMinor: 0n
          }))
        : (["BDT", "USD"] as const).flatMap(currency => [
            {
              currency,
              term: "THREE_MONTHS" as const,
              amountMinor: price(currency, "MONTHLY") * 3n
            },
            {
              currency,
              term: "SIX_MONTHS" as const,
              amountMinor: price(currency, "MONTHLY") * 6n
            },
            {
              currency,
              term: "ONE_YEAR" as const,
              amountMinor: price(currency, "YEARLY")
            }
          ]);

      return tx.planVersion.create({
        data: {
          planId: plan.id,
          version: (plan.versions[0]?.version ?? 0) + 1,
          effectiveAt: input.effectiveAt,
          prices: {
            create: input.prices
          },
          offers: {
            create: offers
          },
          entitlements: {
            create: input.entitlements.map(item => ({
              metric: item.metric,
              includedAmount: item.includedAmount,
              hardLimit: item.hardLimit,
              overageAllowed: item.overageAllowed,
              overageUnit: item.overageUnit ?? null,
              overageBdtMinor: item.overageBdtMinor ?? null,
              overageUsdMinor: item.overageUsdMinor ?? null
            }))
          }
        },
        include: {
          plan: { select: { code: true } },
          prices: true,
          offers: true,
          entitlements: true
        }
      });
    });

    res.status(201).json({
      data: {
        ...created,
        prices: created.prices.map(price => ({
          ...price,
          amountMinor: price.amountMinor.toString()
        })),
        offers: created.offers.map(offer => ({
          ...offer,
          amountMinor: offer.amountMinor.toString()
        })),
        entitlements: created.entitlements.map(item => ({
          ...item,
          includedAmount: item.includedAmount.toString(),
          overageUnit: item.overageUnit?.toString() ?? null,
          overageBdtMinor: item.overageBdtMinor?.toString() ?? null,
          overageUsdMinor: item.overageUsdMinor?.toString() ?? null
        }))
      },
      meta: { requestId: req.id }
    });
  })
);

router.put(
  "/plans/:planId/versions/:versionId/offers",
  asyncHandler(async (req, res) => {
    const planId = routeIdSchema.parse(req.params.planId);
    const versionId = routeIdSchema.parse(req.params.versionId);
    const input = z.object({
      offers: z.array(z.object({
        currency: z.enum(["BDT", "USD"]),
        term: z.enum([
          "FREE",
          "THREE_MONTHS",
          "SIX_MONTHS",
          "ONE_YEAR"
        ]),
        amountMinor: moneySchema,
        isPublic: z.boolean().default(true),
        isActive: z.boolean().default(true)
      })).min(2).max(8)
    }).superRefine((value, context) => {
      const keys = value.offers.map(
        item => `${item.currency}:${item.term}`
      );
      if (new Set(keys).size !== keys.length) {
        context.addIssue({
          code: "custom",
          path: ["offers"],
          message: "Each currency and term can appear only once."
        });
      }
    }).parse(req.body);

    const version = await prisma.planVersion.findFirst({
      where: {
        id: versionId,
        planId,
        retiredAt: null
      },
      select: {
        id: true,
        publishedAt: true,
        plan: { select: { code: true } }
      }
    });

    if (!version) {
      throw new AppError(
        404,
        "PLAN_VERSION_NOT_FOUND",
        "Plan version was not found."
      );
    }

    if (version.publishedAt) {
      throw new AppError(
        409,
        "PUBLISHED_VERSION_IMMUTABLE",
        "Create a new version instead of changing published offers."
      );
    }

    const allowedTerms = version.plan.code === "FREE"
      ? new Set(["FREE"])
      : new Set(["THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"]);

    if (input.offers.some(item => !allowedTerms.has(item.term))) {
      throw new AppError(
        422,
        "PLAN_OFFER_TERM_INVALID",
        "Offer terms do not match the plan type."
      );
    }

    const updated = await prisma.$transaction(async tx => {
      await tx.planOffer.deleteMany({
        where: { planVersionId: version.id }
      });
      await tx.planOffer.createMany({
        data: input.offers.map(item => ({
          planVersionId: version.id,
          ...item
        }))
      });
      return tx.planOffer.findMany({
        where: { planVersionId: version.id },
        orderBy: [{ currency: "asc" }, { term: "asc" }]
      });
    });

    res.json({
      data: updated.map(item => ({
        ...item,
        amountMinor: item.amountMinor.toString()
      })),
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/plans/:planId/versions/:versionId/publish",
  asyncHandler(async (req, res) => {
    const planId = routeIdSchema.parse(req.params.planId);
    const versionId = routeIdSchema.parse(req.params.versionId);

    const published = await prisma.$transaction(async tx => {
      const version = await tx.planVersion.findFirst({
        where: { id: versionId, planId },
        include: {
          plan: { select: { code: true } },
          prices: true,
          offers: true,
          entitlements: true
        }
      });

      if (!version) {
        throw new AppError(
          404,
          "PLAN_VERSION_NOT_FOUND",
          "Plan version was not found."
        );
      }

      const requiredOfferKeys = version.plan.code === "FREE"
        ? ["BDT:FREE", "USD:FREE"]
        : (["BDT", "USD"] as const).flatMap(currency => [
            `${currency}:THREE_MONTHS`,
            `${currency}:SIX_MONTHS`,
            `${currency}:ONE_YEAR`
          ]);
      const offerKeys = new Set(
        version.offers
          .filter(item => item.isActive && item.isPublic)
          .map(item => `${item.currency}:${item.term}`)
      );

      if (
        version.prices.length !== 4 ||
        !requiredOfferKeys.every(key => offerKeys.has(key)) ||
        version.entitlements.length !== usageMetrics.length
      ) {
        throw new AppError(
          409,
          "PLAN_VERSION_INCOMPLETE",
          "Plan version is missing active prices, commercial offers or entitlements."
        );
      }

      await tx.planVersion.updateMany({
        where: {
          planId,
          id: { not: version.id },
          publishedAt: { not: null },
          retiredAt: null
        },
        data: { retiredAt: new Date() }
      });

      return tx.planVersion.update({
        where: { id: version.id },
        data: {
          publishedAt: version.publishedAt ?? new Date(),
          retiredAt: null
        }
      });
    });

    res.json({
      data: published,
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/plans/:planId/versions/:versionId/retire",
  asyncHandler(async (req, res) => {
    const planId = routeIdSchema.parse(req.params.planId);
    const versionId = routeIdSchema.parse(req.params.versionId);
    const result = await prisma.planVersion.updateMany({
      where: { id: versionId, planId },
      data: { retiredAt: new Date() }
    });

    if (result.count !== 1) {
      throw new AppError(
        404,
        "PLAN_VERSION_NOT_FOUND",
        "Plan version was not found."
      );
    }

    res.status(204).send();
  })
);

router.get(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const status = z.enum([
      "TRIALING",
      "ACTIVE",
      "PAST_DUE",
      "GRACE_PERIOD",
      "SUSPENDED",
      "CANCELLED",
      "EXPIRED"
    ]).optional().parse(req.query.status);

    const subscriptions = await prisma.workspaceSubscription.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            subscriptionChanges: {
              where: { status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                requestedPlanVersion: {
                  include: { plan: true }
                },
                requestedBy: {
                  select: { name: true, email: true }
                }
              }
            }
          }
        },
        planVersion: {
          include: { plan: true }
        }
      }
    });

    res.json({
      data: subscriptions.map(item => ({
        id: item.id,
        workspace: item.workspace,
        plan: {
          code: item.planVersion.plan.code,
          name: item.planVersion.plan.name,
          version: item.planVersion.version
        },
        status: item.status,
        currency: item.currency,
        interval: item.interval,
        revenueModel: item.revenueModel,
        subscriptionTerm: item.subscriptionTerm,
        commitmentEndsAt: item.commitmentEndsAt,
        trialEndsAt: item.trialEndsAt,
        graceEndsAt: item.graceEndsAt,
        cancelAtPeriodEnd: item.cancelAtPeriodEnd,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        updatedAt: item.updatedAt,
        pendingChange: item.workspace.subscriptionChanges[0]
          ? {
              id: item.workspace.subscriptionChanges[0].id,
              status: item.workspace.subscriptionChanges[0].status,
              planCode:
                item.workspace.subscriptionChanges[0]
                  .requestedPlanVersion.plan.code,
              planName:
                item.workspace.subscriptionChanges[0]
                  .requestedPlanVersion.plan.name,
              currency: item.workspace.subscriptionChanges[0].currency,
              interval: item.workspace.subscriptionChanges[0].interval,
              effectiveAt: item.workspace.subscriptionChanges[0].effectiveAt,
              requestedAt: item.workspace.subscriptionChanges[0].createdAt,
              requestedBy: item.workspace.subscriptionChanges[0].requestedBy
            }
          : null
      })),
      meta: { requestId: req.id }
    });
  })
);

router.patch(
  "/subscriptions/:workspaceId",
  asyncHandler(async (req, res) => {
    const workspaceId = routeIdSchema.parse(req.params.workspaceId);
    const input = z.object({
      planCode: z.string().trim().min(1).max(40)
        .transform(value => value.toUpperCase()),
      currency: z.enum(["BDT", "USD"]),
      interval: z.enum(["MONTHLY", "YEARLY"]),
      status: z.enum([
        "TRIALING",
        "ACTIVE",
        "PAST_DUE",
        "GRACE_PERIOD",
        "SUSPENDED",
        "CANCELLED",
        "EXPIRED"
      ]).default("ACTIVE"),
      changeId: z.string().min(1).max(100).optional(),
      note: z.string().trim().max(500).optional()
    }).parse(req.body);

    const version = await prisma.planVersion.findFirst({
      where: {
        plan: { code: input.planCode, isActive: true },
        publishedAt: { not: null },
        retiredAt: null,
        prices: {
          some: {
            currency: input.currency,
            interval: input.interval,
            isActive: true
          }
        }
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        entitlements: {
          where: { metric: "STORAGE_BYTES" },
          select: { includedAmount: true },
          take: 1
        }
      }
    });

    if (!version || !version.entitlements[0]) {
      throw new AppError(
        404,
        "PLAN_NOT_FOUND",
        "Requested plan version was not found."
      );
    }

    // Capture the entitlement after the explicit guard above. TypeScript cannot
    // preserve indexed-array narrowing inside the transaction callback.
    const storageLimitBytes = version.entitlements[0].includedAmount;

    const now = new Date();
    const period = getPeriodBounds(now, input.interval);

    const result = await prisma.$transaction(async tx => {
      const requestedChange = input.changeId
        ? await tx.subscriptionChange.findFirst({
            where: {
              id: input.changeId,
              workspaceId,
              status: "PENDING"
            }
          })
        : null;

      if (input.changeId && !requestedChange) {
        throw new AppError(
          409,
          "SUBSCRIPTION_CHANGE_NOT_PENDING",
          "The requested subscription change is no longer pending."
        );
      }

      if (
        requestedChange &&
        (
          requestedChange.requestedPlanVersionId !== version.id ||
          requestedChange.currency !== input.currency ||
          requestedChange.interval !== input.interval
        )
      ) {
        throw new AppError(
          409,
          "SUBSCRIPTION_CHANGE_MISMATCH",
          "The approval does not match the pending request."
        );
      }

      const scheduledEffectiveAt = requestedChange?.effectiveAt;
      const scheduleForRenewal = Boolean(
        scheduledEffectiveAt && scheduledEffectiveAt > now
      );

      if (requestedChange && scheduleForRenewal) {
        await tx.subscriptionChange.update({
          where: { id: requestedChange.id },
          data: {
            status: "APPROVED",
            reviewedById: req.auth!.userId,
            reviewedAt: now,
            note: input.note
          }
        });

        await tx.subscriptionChange.updateMany({
          where: {
            workspaceId,
            id: { not: requestedChange.id },
            status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] }
          },
          data: {
            status: "CANCELLED",
            reviewedById: req.auth!.userId,
            reviewedAt: now,
            note: "Superseded by an approved subscription change."
          }
        });

        const oldRenewals = await tx.billingInvoice.findMany({
          where: {
            workspaceId,
            kind: "RENEWAL",
            status: "OPEN",
            subscriptionChangeId: null
          },
          select: { id: true }
        });
        const oldRenewalIds = oldRenewals.map(item => item.id);
        if (oldRenewalIds.length > 0) {
          await tx.paymentAttempt.updateMany({
            where: {
              invoiceId: { in: oldRenewalIds },
              status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] }
            },
            data: {
              status: "CANCELLED",
              completedAt: now,
              failureReason: "Renewal quote replaced by an approved billing change."
            }
          });
          await tx.billingInvoice.updateMany({
            where: { id: { in: oldRenewalIds } },
            data: { status: "VOID", voidedAt: now }
          });
        }

        const current = await tx.workspaceSubscription.findUnique({
          where: { workspaceId }
        });

        if (!current) {
          throw new AppError(
            404,
            "SUBSCRIPTION_NOT_FOUND",
            "Workspace subscription was not found."
          );
        }

        await tx.auditLog.create({
          data: {
            workspaceId,
            actorId: req.auth!.userId,
            action: "subscription.change_scheduled",
            entityType: "SubscriptionChange",
            entityId: requestedChange.id,
            metadata: {
              planCode: input.planCode,
              currency: input.currency,
              interval: input.interval,
              effectiveAt: scheduledEffectiveAt?.toISOString()
            },
            ipAddress: req.ip
          }
        });

        return {
          subscription: current,
          changeScheduled: true,
          effectiveAt: scheduledEffectiveAt
        };
      }

      const updated = await tx.workspaceSubscription.update({
        where: { workspaceId },
        data: {
          planVersionId: version.id,
          currency: input.currency,
          interval: input.interval,
          status: input.status,
          periodStart: period.start,
          periodEnd: period.end,
          cancelAtPeriodEnd: false,
          graceEndsAt: null
        }
      });

      // An approved plan change adopts the selected plan's storage limit,
      // but never sets a limit below bytes that are already stored.
      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageLimitBytes" = GREATEST(
          "storageUsedBytes",
          ${storageLimitBytes}
        )
        WHERE "id" = ${workspaceId}
      `;

      await tx.billingPreference.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          preferredCurrency: input.currency,
          preferredInterval: input.interval
        },
        update: {
          preferredCurrency: input.currency,
          preferredInterval: input.interval
        }
      });

      if (requestedChange) {
        await tx.subscriptionChange.update({
          where: { id: requestedChange.id },
          data: {
            status: "APPLIED",
            reviewedById: req.auth!.userId,
            reviewedAt: now,
            effectiveAt: now,
            note: input.note
          }
        });

        await tx.subscriptionChange.updateMany({
          where: {
            workspaceId,
            id: { not: requestedChange.id },
            status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] }
          },
          data: {
            status: "CANCELLED",
            reviewedById: req.auth!.userId,
            reviewedAt: now,
            note: "Superseded by an applied subscription change."
          }
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: req.auth!.userId,
          action: "subscription.updated",
          entityType: "WorkspaceSubscription",
          entityId: updated.id,
          metadata: {
            planCode: input.planCode,
            currency: input.currency,
            interval: input.interval,
            status: input.status,
            changeId: input.changeId
          },
          ipAddress: req.ip
        }
      });

      return {
        subscription: updated,
        changeScheduled: false,
        effectiveAt: now
      };
    });

    res.json({
      data: result,
      meta: { requestId: req.id }
    });
  })
);


router.post(
  "/subscriptions/:workspaceId/manual-override",
  asyncHandler(async (req, res) => {
    const workspaceId = routeIdSchema.parse(req.params.workspaceId);
    const input = z.object({
      planCode: z.string().trim().min(1).max(40)
        .transform(value => value.toUpperCase()),
      currency: z.enum(["BDT", "USD"]),
      revenueModel: z.enum([
        "SUBSCRIPTION",
        "PREPAID_PAYG",
        "ENTERPRISE_CUSTOM"
      ]),
      subscriptionTerm: z.enum([
        "FREE",
        "THREE_MONTHS",
        "SIX_MONTHS",
        "ONE_YEAR",
        "ENTERPRISE_CUSTOM"
      ]),
      status: z.enum([
        "TRIALING",
        "ACTIVE",
        "PAST_DUE",
        "GRACE_PERIOD",
        "SUSPENDED",
        "CANCELLED",
        "EXPIRED"
      ]),
      periodStart: z.coerce.date().optional(),
      periodEnd: z.coerce.date().optional(),
      commitmentEndsAt: z.coerce.date().nullable().optional(),
      trialEndsAt: z.coerce.date().nullable().optional(),
      graceEndsAt: z.coerce.date().nullable().optional(),
      cancelAtPeriodEnd: z.boolean().default(false),
      cancelPendingRequests: z.boolean().default(true),
      note: z.string().trim().min(3).max(1000)
    }).superRefine((value, context) => {
      if (
        value.revenueModel === "SUBSCRIPTION" &&
        value.subscriptionTerm === "ENTERPRISE_CUSTOM"
      ) {
        context.addIssue({
          code: "custom",
          path: ["subscriptionTerm"],
          message: "Enterprise custom term requires the enterprise revenue model."
        });
      }

      if (
        value.revenueModel === "PREPAID_PAYG" &&
        value.subscriptionTerm !== "FREE"
      ) {
        context.addIssue({
          code: "custom",
          path: ["subscriptionTerm"],
          message: "Prepaid PAYG uses the FREE subscription term."
        });
      }

      if (
        value.revenueModel === "ENTERPRISE_CUSTOM" &&
        value.subscriptionTerm !== "ENTERPRISE_CUSTOM"
      ) {
        context.addIssue({
          code: "custom",
          path: ["subscriptionTerm"],
          message: "Enterprise revenue requires the ENTERPRISE_CUSTOM term."
        });
      }

      if (
        value.revenueModel === "ENTERPRISE_CUSTOM" &&
        !value.commitmentEndsAt
      ) {
        context.addIssue({
          code: "custom",
          path: ["commitmentEndsAt"],
          message: "Enterprise subscriptions require a commitment end date."
        });
      }

      if (
        value.periodStart &&
        value.periodEnd &&
        value.periodEnd <= value.periodStart
      ) {
        context.addIssue({
          code: "custom",
          path: ["periodEnd"],
          message: "Period end must be later than period start."
        });
      }
    }).parse(req.body);

    const version = await prisma.planVersion.findFirst({
      where: {
        plan: { code: input.planCode, isActive: true },
        publishedAt: { not: null },
        retiredAt: null
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        plan: { select: { code: true, name: true } },
        entitlements: {
          where: { metric: "STORAGE_BYTES" },
          select: { includedAmount: true },
          take: 1
        }
      }
    });

    if (!version || !version.entitlements[0]) {
      throw new AppError(
        404,
        "PLAN_NOT_FOUND",
        "Requested published plan version was not found."
      );
    }

    const startsAt = input.periodStart ?? new Date();
    const interval = input.revenueModel === "SUBSCRIPTION"
      ? subscriptionTermToInterval(input.subscriptionTerm)
      : "MONTHLY";
    const monthlyPeriod = getPeriodBounds(startsAt, interval);
    const periodEnd = input.periodEnd ?? monthlyPeriod.end;

    let commitmentEndsAt = input.commitmentEndsAt ?? null;
    if (
      input.revenueModel === "SUBSCRIPTION" &&
      input.subscriptionTerm !== "FREE"
    ) {
      commitmentEndsAt = input.commitmentEndsAt ??
        getSubscriptionCommitmentBounds(
          startsAt,
          input.subscriptionTerm
        ).end;
    }
    if (input.subscriptionTerm === "FREE") {
      commitmentEndsAt = null;
    }

    if (commitmentEndsAt && commitmentEndsAt <= startsAt) {
      throw new AppError(
        422,
        "INVALID_COMMITMENT_DATE",
        "Commitment end must be later than the period start."
      );
    }

    const storageLimitBytes =
      version.entitlements[0].includedAmount;
    const now = new Date();

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Workspace"
        WHERE "id" = ${workspaceId}
        FOR UPDATE
      `;

      const before = await tx.workspaceSubscription.findUnique({
        where: { workspaceId },
        include: {
          planVersion: { include: { plan: true } }
        }
      });

      if (!before) {
        throw new AppError(
          404,
          "SUBSCRIPTION_NOT_FOUND",
          "Workspace subscription was not found."
        );
      }

      const updated = await tx.workspaceSubscription.update({
        where: { workspaceId },
        data: {
          planVersionId: version.id,
          currency: input.currency,
          interval,
          revenueModel: input.revenueModel,
          subscriptionTerm: input.subscriptionTerm,
          commitmentEndsAt,
          status: input.status,
          periodStart: startsAt,
          periodEnd,
          trialEndsAt: input.trialEndsAt ?? null,
          graceEndsAt: input.graceEndsAt ?? null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd
        }
      });

      await tx.$executeRaw`
        UPDATE "Workspace"
        SET "storageLimitBytes" = GREATEST(
          "storageUsedBytes",
          ${storageLimitBytes}
        )
        WHERE "id" = ${workspaceId}
      `;

      await tx.billingPreference.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          preferredCurrency: input.currency,
          preferredInterval: interval,
          revenueModel: input.revenueModel,
          subscriptionTerm: input.subscriptionTerm
        },
        update: {
          preferredCurrency: input.currency,
          preferredInterval: interval,
          revenueModel: input.revenueModel,
          subscriptionTerm: input.subscriptionTerm
        }
      });

      if (input.revenueModel === "PREPAID_PAYG") {
        await ensurePrepaidWalletInTransaction(
          tx,
          workspaceId,
          input.currency
        );
      }

      let cancelledChanges = 0;
      let voidedInvoices = 0;
      if (input.cancelPendingRequests) {
        const changes = await tx.subscriptionChange.findMany({
          where: {
            workspaceId,
            status: {
              in: ["PAYMENT_PENDING", "PENDING", "APPROVED"]
            }
          },
          select: { id: true }
        });
        const changeIds = changes.map(item => item.id);

        if (changeIds.length > 0) {
          const cancelled = await tx.subscriptionChange.updateMany({
            where: { id: { in: changeIds } },
            data: {
              status: "CANCELLED",
              reviewedById: req.auth!.userId,
              reviewedAt: now,
              note: `Cancelled by manual admin override: ${input.note}`
            }
          });
          cancelledChanges = cancelled.count;
        }

        const invoices = await tx.billingInvoice.findMany({
          where: {
            workspaceId,
            status: "OPEN",
            OR: [
              { kind: "RENEWAL" },
              { subscriptionChangeId: { in: changeIds } }
            ]
          },
          select: { id: true }
        });
        const invoiceIds = invoices.map(item => item.id);

        if (invoiceIds.length > 0) {
          await tx.paymentAttempt.updateMany({
            where: {
              invoiceId: { in: invoiceIds },
              status: {
                in: ["PENDING", "PROCESSING", "UNDER_REVIEW"]
              }
            },
            data: {
              status: "CANCELLED",
              completedAt: now,
              failureReason:
                "Cancelled by a platform administrator subscription override."
            }
          });
          const voided = await tx.billingInvoice.updateMany({
            where: { id: { in: invoiceIds } },
            data: { status: "VOID", voidedAt: now }
          });
          voidedInvoices = voided.count;
        }
      }

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: req.auth!.userId,
          action: "subscription.admin_override",
          entityType: "WorkspaceSubscription",
          entityId: updated.id,
          metadata: {
            note: input.note,
            before: {
              planCode: before.planVersion.plan.code,
              planVersion: before.planVersion.version,
              status: before.status,
              currency: before.currency,
              interval: before.interval,
              revenueModel: before.revenueModel,
              subscriptionTerm: before.subscriptionTerm,
              periodStart: before.periodStart.toISOString(),
              periodEnd: before.periodEnd.toISOString(),
              commitmentEndsAt:
                before.commitmentEndsAt?.toISOString() ?? null
            },
            after: {
              planCode: version.plan.code,
              planVersion: version.version,
              status: input.status,
              currency: input.currency,
              interval,
              revenueModel: input.revenueModel,
              subscriptionTerm: input.subscriptionTerm,
              periodStart: startsAt.toISOString(),
              periodEnd: periodEnd.toISOString(),
              commitmentEndsAt:
                commitmentEndsAt?.toISOString() ?? null
            },
            cancelledChanges,
            voidedInvoices
          },
          ipAddress: req.ip
        }
      });

      return {
        subscription: updated,
        cancelledChanges,
        voidedInvoices
      };
    });

    res.json({
      data: result,
      meta: { requestId: req.id }
    });
  })
);

router.post(
  "/subscriptions/:workspaceId/changes/:changeId/reject",
  asyncHandler(async (req, res) => {
    const workspaceId = routeIdSchema.parse(req.params.workspaceId);
    const changeId = routeIdSchema.parse(req.params.changeId);
    const input = z.object({
      note: z.string().trim().max(500).nullable().optional()
    }).parse(req.body);

    const result = await prisma.$transaction(async tx => {
      const updated = await tx.subscriptionChange.updateMany({
        where: {
          id: changeId,
          workspaceId,
          status: { in: ["PAYMENT_PENDING", "PENDING"] }
        },
        data: {
          status: "REJECTED",
          reviewedById: req.auth!.userId,
          reviewedAt: new Date(),
          note: input.note ?? "Rejected by platform administrator."
        }
      });
      if (updated.count === 1) {
        const now = new Date();
        const invoices = await tx.billingInvoice.findMany({
          where: { subscriptionChangeId: changeId, status: "OPEN" },
          select: { id: true }
        });
        const invoiceIds = invoices.map(item => item.id);
        if (invoiceIds.length > 0) {
          await tx.paymentAttempt.updateMany({
            where: {
              invoiceId: { in: invoiceIds },
              status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] }
            },
            data: {
              status: "CANCELLED",
              completedAt: now,
              failureReason: "Subscription request rejected by platform administrator."
            }
          });
          await tx.billingInvoice.updateMany({
            where: { id: { in: invoiceIds } },
            data: { status: "VOID", voidedAt: now }
          });
        }
      }
      return updated;
    });

    if (result.count !== 1) {
      throw new AppError(
        404,
        "SUBSCRIPTION_CHANGE_NOT_FOUND",
        "Pending subscription change was not found."
      );
    }

    res.status(204).send();
  })
);

router.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const periodStart = z.coerce.date().optional().parse(req.query.periodStart);
    const aggregates = await prisma.usageAggregate.findMany({
      where: periodStart ? { periodStart: { gte: periodStart } } : undefined,
      orderBy: { quantity: "desc" },
      take: 500,
      include: {
        workspace: {
          select: { name: true, slug: true }
        }
      }
    });

    res.json({
      data: aggregates.map(item => ({
        ...item,
        quantity: item.quantity.toString()
      })),
      meta: { requestId: req.id }
    });
  })
);

export default router;
