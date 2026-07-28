import { Router } from "express";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma, Prisma } from "@media/database";
import { env } from "../../config/env.js";
import {
  ensureWorkspaceStorage,
  storageHealth
} from "../../infrastructure/storage.js";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { getRedisHealth } from "../../infrastructure/redis.js";
import { getCacheStats } from "../../infrastructure/cache.js";
import { getImageOptimizationHealth } from "../processing/image-optimization-scheduler.js";
import {
  isPlatformAdminEmail,
  platformAdminEmails,
  requirePlatformAdmin
} from "../../middleware/platform-admin.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { createFreeBillingForWorkspace } from "../billing/billing.service.js";
import {
  defaultLowBalanceMinor,
  ensurePrepaidWalletInTransaction
} from "../billing/revenue.service.js";

const router = Router();
router.use(authenticate, requireUser, requirePlatformAdmin);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(120).optional()
});

const userStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
const workspaceStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);

function groupCounts<T extends string>(
  rows: Array<{ status: T; _count: { _all: number } }>
): Record<T, number> {
  return Object.fromEntries(
    rows.map(row => [row.status, row._count._all])
  ) as Record<T, number>;
}

function adminAudit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}) {
  return prisma.auditLog.create({
    data: {
      workspaceId: null,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ipAddress: input.ipAddress
    }
  });
}

router.get(
  "/console/overview",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      userGroups,
      workspaceGroups,
      subscriptionGroups,
      invoiceGroups,
      paymentGroups,
      storage,
      activeSessions,
      activeUploads,
      failedAssets,
      processingVariants,
      pendingManualPayments,
      overdueInvoices,
      usersThisMonth,
      workspacesThisMonth,
      recentAudit,
      recentUsers
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.workspace.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.workspaceSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.billingInvoice.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.paymentAttempt.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.workspace.aggregate({
        _sum: {
          storageUsedBytes: true,
          storageReservedBytes: true,
          storageLimitBytes: true
        }
      }),
      prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: now } }
      }),
      prisma.uploadSession.count({
        where: { status: { in: ["ACTIVE", "COMPLETING"] } }
      }),
      prisma.mediaAsset.count({ where: { status: "FAILED" } }),
      prisma.mediaVariant.count({
        where: { status: { in: ["PENDING", "PROCESSING"] } }
      }),
      prisma.manualPaymentSubmission.count({
        where: { reviewedAt: null }
      }),
      prisma.billingInvoice.count({
        where: { status: "OPEN", dueAt: { lt: now } }
      }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.workspace.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.auditLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    res.json({
      data: {
        counts: {
          users: groupCounts(userGroups),
          workspaces: groupCounts(workspaceGroups),
          subscriptions: groupCounts(subscriptionGroups),
          invoices: groupCounts(invoiceGroups),
          payments: groupCounts(paymentGroups),
          activeSessions,
          activeUploads,
          failedAssets,
          processingVariants,
          pendingManualPayments,
          overdueInvoices,
          usersThisMonth,
          workspacesThisMonth
        },
        storage: {
          usedBytes: String(storage._sum.storageUsedBytes ?? 0n),
          reservedBytes: String(storage._sum.storageReservedBytes ?? 0n),
          limitBytes: String(storage._sum.storageLimitBytes ?? 0n)
        },
        recentAudit,
        recentUsers
      },
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/console/users",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.extend({
      status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional()
    }).parse(req.query);
    const skip = (query.page - 1) * query.limit;
    const where = {
      status: query.status,
      ...(query.query
        ? {
            OR: [
              { name: { contains: query.query, mode: "insensitive" as const } },
              { email: { contains: query.query, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
        select: {
          id: true,
          name: true,
          email: true,
          normalizedEmail: true,
          emailVerifiedAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            orderBy: { createdAt: "asc" },
            select: {
              role: true,
              workspace: {
                select: { id: true, name: true, slug: true, status: true }
              }
            }
          },
          _count: {
            select: {
              memberships: true,
              sessions: {
                where: { revokedAt: null, expiresAt: { gt: new Date() } }
              }
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      data: items.map(({ normalizedEmail, ...item }) => ({
        ...item,
        isPlatformAdmin: isPlatformAdminEmail(normalizedEmail)
      })),
      meta: {
        requestId: req.id,
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit))
      }
    });
  })
);

router.patch(
  "/console/users/:userId/status",
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.string().cuid() }).parse(req.params);
    const input = z.object({ status: userStatusSchema }).parse(req.body);

    if (userId === req.auth!.userId && input.status !== "ACTIVE") {
      throw new AppError(409, "ADMIN_SELF_SUSPEND_BLOCKED", "You cannot suspend your own administrator account.");
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, normalizedEmail: true, status: true }
    });
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    if (target.status === "DELETED") {
      throw new AppError(409, "DELETED_USER_IMMUTABLE", "A deleted user cannot be reactivated from the admin console.");
    }
    if (isPlatformAdminEmail(target.normalizedEmail) && input.status !== "ACTIVE") {
      throw new AppError(409, "ADMIN_SUSPEND_BLOCKED", "Platform administrator accounts cannot be suspended here.");
    }

    const now = new Date();
    const user = await prisma.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          status: input.status,
          ...(input.status === "SUSPENDED"
            ? { passwordVersion: { increment: 1 } }
            : {})
        },
        select: { id: true, name: true, email: true, status: true, updatedAt: true }
      });

      if (input.status === "SUSPENDED") {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now }
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: null,
          actorId: req.auth!.userId,
          action: "platform.user.status_changed",
          entityType: "User",
          entityId: userId,
          metadata: { from: target.status, to: input.status },
          ipAddress: req.ip
        }
      });

      return updated;
    });

    res.json({ data: user, meta: { requestId: req.id } });
  })
);

router.post(
  "/console/users/:userId/revoke-sessions",
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.string().cuid() }).parse(req.params);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");

    const result = await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await adminAudit({
      actorId: req.auth!.userId,
      action: "platform.user.sessions_revoked",
      entityType: "User",
      entityId: userId,
      metadata: { revokedSessions: result.count },
      ipAddress: req.ip
    });

    res.json({
      data: { userId, revokedSessions: result.count },
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/console/workspaces",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.extend({
      status: workspaceStatusSchema.optional()
    }).parse(req.query);
    const skip = (query.page - 1) * query.limit;
    const where = {
      status: query.status,
      ...(query.query
        ? {
            OR: [
              { name: { contains: query.query, mode: "insensitive" as const } },
              { slug: { contains: query.query, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          storageUsedBytes: true,
          storageReservedBytes: true,
          storageLimitBytes: true,
          createdAt: true,
          updatedAt: true,
          subscription: {
            select: {
              status: true,
              currency: true,
              interval: true,
              periodEnd: true,
              planVersion: {
                select: { version: true, plan: { select: { code: true, name: true } } }
              }
            }
          },
          _count: {
            select: {
              members: true,
              mediaAssets: true,
              folders: true,
              apiKeys: true
            }
          }
        }
      }),
      prisma.workspace.count({ where })
    ]);

    res.json({
      data: items.map(item => ({
        ...item,
        storageUsedBytes: String(item.storageUsedBytes),
        storageReservedBytes: String(item.storageReservedBytes),
        storageLimitBytes: String(item.storageLimitBytes)
      })),
      meta: {
        requestId: req.id,
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit))
      }
    });
  })
);

router.patch(
  "/console/workspaces/:workspaceId/status",
  asyncHandler(async (req, res) => {
    const { workspaceId } = z.object({ workspaceId: z.string().cuid() }).parse(req.params);
    const input = z.object({ status: workspaceStatusSchema }).parse(req.body);

    if (workspaceId === req.auth!.workspaceId && input.status !== "ACTIVE") {
      throw new AppError(409, "CURRENT_WORKSPACE_SUSPEND_BLOCKED", "The workspace used by your current administrator session cannot be suspended.");
    }

    const existing = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, status: true }
    });
    if (!existing) throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");

    const workspace = await prisma.$transaction(async tx => {
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: { status: input.status },
        select: { id: true, name: true, slug: true, status: true, updatedAt: true }
      });

      if (input.status === "SUSPENDED") {
        const members = await tx.workspaceMember.findMany({
          where: { workspaceId },
          select: { userId: true }
        });
        await tx.session.updateMany({
          where: { userId: { in: members.map(member => member.userId) }, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: null,
          actorId: req.auth!.userId,
          action: "platform.workspace.status_changed",
          entityType: "Workspace",
          entityId: workspaceId,
          metadata: { from: existing.status, to: input.status },
          ipAddress: req.ip
        }
      });

      return updated;
    });

    res.json({ data: workspace, meta: { requestId: req.id } });
  })
);

router.get(
  "/console/operations",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const [
      uploads,
      failedAssets,
      variants,
      expiredReservations,
      webhookFailures,
      failedUsageEmails,
      failedPaygCharges,
      openInvoices,
      pendingPayments
    ] = await Promise.all([
      prisma.uploadSession.findMany({
        where: { status: { in: ["ACTIVE", "COMPLETING"] } },
        orderBy: { updatedAt: "asc" },
        take: 30,
        select: {
          id: true,
          status: true,
          expectedBytes: true,
          receivedBytes: true,
          expectedChunks: true,
          receivedChunks: true,
          expiresAt: true,
          updatedAt: true,
          workspace: { select: { id: true, name: true, slug: true } },
          mediaAsset: { select: { id: true, originalFilename: true } }
        }
      }),
      prisma.mediaAsset.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          originalFilename: true,
          contentType: true,
          sizeBytes: true,
          updatedAt: true,
          workspace: { select: { id: true, name: true, slug: true } }
        }
      }),
      prisma.mediaVariant.findMany({
        where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          kind: true,
          status: true,
          errorMessage: true,
          updatedAt: true,
          mediaAsset: {
            select: {
              id: true,
              originalFilename: true,
              workspace: { select: { id: true, name: true } }
            }
          }
        }
      }),
      prisma.quotaReservation.count({
        where: { status: "ACTIVE", expiresAt: { lt: now } }
      }),
      prisma.paymentWebhookEvent.findMany({
        where: { processingError: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          provider: true,
          transactionId: true,
          processingError: true,
          processedAt: true,
          createdAt: true
        }
      }),
      prisma.usageAlert.findMany({
        where: { emailStatus: "FAILED" },
        orderBy: { lastEmailAttemptAt: "desc" },
        take: 30,
        select: {
          id: true,
          metric: true,
          threshold: true,
          emailRecipient: true,
          emailLastError: true,
          lastEmailAttemptAt: true,
          workspace: {
            select: { id: true, name: true, slug: true }
          }
        }
      }),
      prisma.paygChargeAttempt.findMany({
        where: {
          status: { in: ["FAILED", "REQUIRES_ACTION"] }
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          amountMinor: true,
          currency: true,
          status: true,
          providerPaymentIntentId: true,
          failureCode: true,
          failureReason: true,
          createdAt: true,
          completedAt: true,
          workspace: {
            select: { id: true, name: true, slug: true }
          },
          paymentMethod: {
            select: {
              provider: true,
              brand: true,
              last4: true
            }
          }
        }
      }),
      prisma.billingInvoice.count({ where: { status: "OPEN" } }),
      prisma.paymentAttempt.count({
        where: { status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] } }
      })
    ]);

    res.json({
      data: {
        counts: {
          activeUploads: uploads.length,
          failedAssets: failedAssets.length,
          queuedOrFailedVariants: variants.length,
          expiredReservations,
          webhookFailures: webhookFailures.length,
          failedUsageEmails: failedUsageEmails.length,
          failedPaygCharges: failedPaygCharges.length,
          openInvoices,
          pendingPayments
        },
        uploads: uploads.map(item => ({
          ...item,
          expectedBytes: String(item.expectedBytes),
          receivedBytes: String(item.receivedBytes)
        })),
        failedAssets: failedAssets.map(item => ({
          ...item,
          sizeBytes: String(item.sizeBytes)
        })),
        variants,
        webhookFailures,
        failedUsageEmails,
        failedPaygCharges: failedPaygCharges.map(item => ({
          ...item,
          amountMinor: item.amountMinor.toString()
        })),
        redis: getRedisHealth(),
        cache: getCacheStats(),
        imageOptimization: getImageOptimizationHealth()
      },
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/console/audit",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.extend({
      action: z.string().trim().max(120).optional(),
      entityType: z.string().trim().max(120).optional()
    }).parse(req.query);
    const skip = (query.page - 1) * query.limit;
    const where = {
      action: query.action,
      entityType: query.entityType,
      ...(query.query
        ? {
            OR: [
              { action: { contains: query.query, mode: "insensitive" as const } },
              { entityType: { contains: query.query, mode: "insensitive" as const } },
              { entityId: { contains: query.query, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit
      }),
      prisma.auditLog.count({ where })
    ]);

    const actorIds = [...new Set(items.map(item => item.actorId).filter((id): id is string => Boolean(id)))];
    const workspaceIds = [...new Set(items.map(item => item.workspaceId).filter((id): id is string => Boolean(id)))];
    const [actors, workspaces] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true }
      }),
      prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true, name: true, slug: true }
      })
    ]);
    const actorMap = new Map(actors.map(actor => [actor.id, actor]));
    const workspaceMap = new Map(workspaces.map(workspace => [workspace.id, workspace]));

    res.json({
      data: items.map(item => ({
        ...item,
        actor: item.actorId ? actorMap.get(item.actorId) ?? null : null,
        workspace: item.workspaceId ? workspaceMap.get(item.workspaceId) ?? null : null
      })),
      meta: {
        requestId: req.id,
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit))
      }
    });
  })
);

router.get(
  "/console/security-events",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.extend({
      severity: z.string().trim().max(40).optional(),
      eventType: z.string().trim().max(120).optional()
    }).parse(req.query);
    const skip = (query.page - 1) * query.limit;
    const where = {
      severity: query.severity,
      eventType: query.eventType,
      ...(query.query
        ? {
            OR: [
              { severity: { contains: query.query, mode: "insensitive" as const } },
              { eventType: { contains: query.query, mode: "insensitive" as const } },
              { ipAddress: { contains: query.query, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit
      }),
      prisma.securityEvent.count({ where })
    ]);

    const userIds = [...new Set(items.map(item => item.userId).filter((id): id is string => Boolean(id)))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    });
    const userMap = new Map(users.map(user => [user.id, user]));

    res.json({
      data: items.map(item => ({
        ...item,
        user: item.userId ? userMap.get(item.userId) ?? null : null
      })),
      meta: {
        requestId: req.id,
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit))
      }
    });
  })
);

router.get(
  "/console/system",
  asyncHandler(async (req, res) => {
    const started = Date.now();
    const [databaseRows, storage, latestMigration, activeAdmins] = await Promise.all([
      prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`,
      storageHealth(),
      prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
        SELECT migration_name, finished_at
        FROM "_prisma_migrations"
        WHERE rolled_back_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `.catch(() => []),
      prisma.user.findMany({
        where: { normalizedEmail: { in: [...platformAdminEmails()] } },
        select: { id: true, name: true, email: true, status: true }
      })
    ]);

    res.json({
      data: {
        status: "healthy",
        responseTimeMs: Date.now() - started,
        database: {
          connected: databaseRows.length === 1,
          serverTime: databaseRows[0]?.now ?? null,
          latestMigration: latestMigration[0] ?? null
        },
        storage,
        runtime: {
          nodeVersion: process.version,
          environment: env.NODE_ENV,
          uptimeSeconds: Math.floor(process.uptime()),
          memory: {
            rssBytes: String(process.memoryUsage().rss),
            heapUsedBytes: String(process.memoryUsage().heapUsed),
            heapTotalBytes: String(process.memoryUsage().heapTotal)
          }
        },
        features: {
          manualPayments: env.MANUAL_PAYMENT_ENABLED,
          manualPaymentProofRequired: env.MANUAL_PAYMENT_PROOF_REQUIRED,
          sslCommerz: env.SSLCOMMERZ_ENABLED,
          sslCommerzSandbox: env.SSLCOMMERZ_SANDBOX,
          payg: env.PAYG_ENABLED,
          paygCardProvider: env.PAYG_CARD_PROVIDER,
          stripePayg: env.STRIPE_PAYG_ENABLED,
          sslCommerzCardOnFile: false,
          cookieSecure: env.COOKIE_SECURE,
          cookieSameSite: env.COOKIE_SAME_SITE
        },
        administrators: activeAdmins
      },
      meta: { requestId: req.id }
    });
  })
);


router.post(
  "/console/users",
  asyncHandler(async (req, res) => {
    const input = z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email(),
      password: z.string().min(8).max(200),
      emailVerified: z.boolean().default(true),
      status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
      createWorkspace: z.boolean().default(true),
      workspaceName: z.string().trim().min(2).max(160).optional()
    }).parse(req.body);

    const normalizedEmail = input.email.toLowerCase();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id
    });

    const result = await prisma.$transaction(async tx => {
      const exists = await tx.user.findUnique({
        where: { normalizedEmail }
      });
      if (exists) {
        throw new AppError(
          409,
          "EMAIL_ALREADY_EXISTS",
          "A user with this email already exists."
        );
      }

      const user = await tx.user.create({
        data: {
          name: input.name,
          email: normalizedEmail,
          normalizedEmail,
          passwordHash,
          emailVerifiedAt:
            input.emailVerified ? new Date() : null,
          status: input.status
        },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true
        }
      });

      let workspaceId: string | null = null;

      if (input.createWorkspace) {
        const workspace = await tx.workspace.create({
          data: {
            name:
              input.workspaceName ??
              `${input.name}'s Workspace`,
            slug:
              `admin-${user.id.slice(-10)}`,
            storageRootKey: `pending/${user.id}`,
            status: "ACTIVE",
            storageLimitBytes: 2147483648n,
            members: {
              create: {
                userId: user.id,
                role: "OWNER"
              }
            }
          }
        });

        await tx.workspace.update({
          where: { id: workspace.id },
          data: {
            storageRootKey: `tenants/${workspace.id}`
          }
        });

        await createFreeBillingForWorkspace(tx, {
          workspaceId: workspace.id,
          billingEmail: user.email,
          currency: "BDT"
        });

        await ensurePrepaidWalletInTransaction(
          tx,
          workspace.id,
          "BDT"
        );

        workspaceId = workspace.id;
      }

      await tx.auditLog.create({
        data: {
          workspaceId: null,
          actorId: req.auth!.userId,
          action: "platform.user.created",
          entityType: "User",
          entityId: user.id,
          metadata: {
            email: user.email,
            status: user.status,
            workspaceId
          },
          ipAddress: req.ip
        }
      });

      return { user, workspaceId };
    });

    if (result.workspaceId) {
      await ensureWorkspaceStorage(result.workspaceId);
    }

    res.status(201).json({
      data: result,
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/console/users/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = z.object({
      userId: z.string().cuid()
    }).parse(req.params);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        normalizedEmail: true,
        emailVerifiedAt: true,
        status: true,
        passwordVersion: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          include: {
            workspace: {
              include: {
                subscription: {
                  include: {
                    planVersion: {
                      include: { plan: true }
                    }
                  }
                },
                prepaidWallet: true,
                _count: {
                  select: {
                    mediaAssets: true,
                    apiKeys: true,
                    folders: true,
                    members: true
                  }
                }
              }
            }
          }
        },
        sessions: {
          where: { revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            expiresAt: true,
            lastUsedAt: true,
            createdAt: true
          }
        }
      }
    });

    if (!user) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "User was not found."
      );
    }

    res.json({
      data: {
        ...user,
        isPlatformAdmin:
          isPlatformAdminEmail(user.normalizedEmail),
        memberships: user.memberships.map(item => ({
          ...item,
          workspace: {
            ...item.workspace,
            storageLimitBytes:
              item.workspace.storageLimitBytes.toString(),
            storageUsedBytes:
              item.workspace.storageUsedBytes.toString(),
            storageReservedBytes:
              item.workspace.storageReservedBytes.toString(),
            prepaidWallet: item.workspace.prepaidWallet
              ? {
                  ...item.workspace.prepaidWallet,
                  balanceMinor:
                    item.workspace.prepaidWallet.balanceMinor.toString(),
                  reservedMinor:
                    item.workspace.prepaidWallet.reservedMinor.toString(),
                  lowBalanceThresholdMinor:
                    item.workspace.prepaidWallet.lowBalanceThresholdMinor.toString()
                }
              : null
          }
        }))
      },
      meta: { requestId: req.id }
    });
  })
);

router.patch(
  "/console/users/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = z.object({
      userId: z.string().cuid()
    }).parse(req.params);
    const input = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      email: z.string().trim().email().optional(),
      emailVerified: z.boolean().optional(),
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      password: z.string().min(8).max(200).optional()
    }).refine(
      value => Object.keys(value).length > 0,
      "At least one field is required."
    ).parse(req.body);

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        normalizedEmail: true,
        status: true
      }
    });

    if (!target) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "User was not found."
      );
    }

    if (
      userId === req.auth!.userId &&
      input.status === "SUSPENDED"
    ) {
      throw new AppError(
        409,
        "ADMIN_SELF_SUSPEND_BLOCKED",
        "You cannot suspend your own account."
      );
    }

    if (
      isPlatformAdminEmail(target.normalizedEmail) &&
      input.status === "SUSPENDED"
    ) {
      throw new AppError(
        409,
        "ADMIN_SUSPEND_BLOCKED",
        "Platform administrators cannot be suspended here."
      );
    }

    const normalizedEmail =
      input.email?.toLowerCase();
    const passwordHash = input.password
      ? await argon2.hash(input.password, {
          type: argon2.argon2id
        })
      : undefined;
    const now = new Date();

    const user = await prisma.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          email: normalizedEmail,
          normalizedEmail,
          emailVerifiedAt:
            input.emailVerified === undefined
              ? undefined
              : input.emailVerified
                ? now
                : null,
          status: input.status,
          passwordHash,
          ...(passwordHash ||
          input.status === "SUSPENDED"
            ? { passwordVersion: { increment: 1 } }
            : {})
        },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerifiedAt: true,
          status: true,
          updatedAt: true
        }
      }).catch(error => {
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new AppError(
            409,
            "EMAIL_ALREADY_EXISTS",
            "A user with this email already exists."
          );
        }
        throw error;
      });

      if (
        passwordHash ||
        input.status === "SUSPENDED"
      ) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now }
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: null,
          actorId: req.auth!.userId,
          action: "platform.user.updated",
          entityType: "User",
          entityId: userId,
          metadata: {
            changedFields:
              Object.keys(input).filter(
                key => key !== "password"
              ),
            passwordReset: Boolean(passwordHash)
          },
          ipAddress: req.ip
        }
      });

      return updated;
    });

    res.json({
      data: user,
      meta: { requestId: req.id }
    });
  })
);

router.delete(
  "/console/users/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = z.object({
      userId: z.string().cuid()
    }).parse(req.params);

    if (userId === req.auth!.userId) {
      throw new AppError(
        409,
        "ADMIN_SELF_DELETE_BLOCKED",
        "You cannot delete your own account."
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        normalizedEmail: true,
        status: true
      }
    });

    if (!target) {
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "User was not found."
      );
    }

    if (isPlatformAdminEmail(target.normalizedEmail)) {
      throw new AppError(
        409,
        "ADMIN_DELETE_BLOCKED",
        "Platform administrators cannot be deleted."
      );
    }

    await prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "DELETED",
          passwordVersion: { increment: 1 }
        }
      });

      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: null,
          actorId: req.auth!.userId,
          action: "platform.user.deleted",
          entityType: "User",
          entityId: userId,
          metadata: { softDelete: true },
          ipAddress: req.ip
        }
      });
    });

    res.status(204).send();
  })
);


router.get(
  "/console/billing-control",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const [
      subscriptionChanges,
      payments,
      walletTopups,
      enterpriseInquiries,
      attentionSubscriptions
    ] = await Promise.all([
      prisma.subscriptionChange.findMany({
        where: {
          status: { in: ["PAYMENT_PENDING", "PENDING", "APPROVED"] }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 50,
        include: {
          workspace: {
            select: { id: true, name: true, slug: true }
          },
          requestedBy: {
            select: { id: true, name: true, email: true }
          },
          requestedPlanVersion: {
            include: { plan: true }
          },
          invoice: {
            select: {
              id: true,
              number: true,
              status: true,
              amountMinor: true,
              currency: true,
              dueAt: true
            }
          }
        }
      }),
      prisma.paymentAttempt.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 50,
        include: {
          invoice: {
            include: {
              workspace: {
                select: { id: true, name: true, slug: true }
              },
              requestedBy: {
                select: { id: true, name: true, email: true }
              },
              planVersion: {
                include: { plan: true }
              }
            }
          },
          manualSubmission: {
            select: {
              transactionReference: true,
              senderAccount: true,
              senderName: true,
              paidAt: true,
              reviewedAt: true,
              proofFilename: true
            }
          }
        }
      }),
      prisma.billingInvoice.findMany({
        where: { kind: "WALLET_TOPUP", status: "OPEN" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 50,
        include: {
          workspace: {
            select: { id: true, name: true, slug: true }
          },
          requestedBy: {
            select: { id: true, name: true, email: true }
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              method: true,
              status: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.enterpriseInquiry.findMany({
        where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 50,
        include: {
          workspace: {
            select: { id: true, name: true, slug: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          },
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
        }
      }),
      prisma.workspaceSubscription.findMany({
        where: {
          OR: [
            { status: { in: ["PAST_DUE", "GRACE_PERIOD", "SUSPENDED"] } },
            { periodEnd: { lt: now }, status: "ACTIVE" }
          ]
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 50,
        include: {
          workspace: {
            select: { id: true, name: true, slug: true, status: true }
          },
          planVersion: { include: { plan: true } }
        }
      })
    ]);

    res.json({
      data: {
        counts: {
          subscriptionChanges: subscriptionChanges.length,
          payments: payments.length,
          walletTopups: walletTopups.length,
          enterpriseInquiries: enterpriseInquiries.length,
          attentionSubscriptions: attentionSubscriptions.length
        },
        subscriptionChanges: subscriptionChanges.map(item => ({
          id: item.id,
          status: item.status,
          currency: item.currency,
          interval: item.interval,
          revenueModel: item.revenueModel,
          subscriptionTerm: item.subscriptionTerm,
          effectiveAt: item.effectiveAt,
          createdAt: item.createdAt,
          workspace: item.workspace,
          requestedBy: item.requestedBy,
          requestedPlan: {
            code: item.requestedPlanVersion.plan.code,
            name: item.requestedPlanVersion.plan.name,
            version: item.requestedPlanVersion.version
          },
          invoice: item.invoice
            ? {
                ...item.invoice,
                amountMinor: item.invoice.amountMinor.toString()
              }
            : null
        })),
        payments: payments.map(item => ({
          id: item.id,
          method: item.method,
          status: item.status,
          amountMinor: item.amountMinor.toString(),
          currency: item.currency,
          createdAt: item.createdAt,
          riskLevel: item.riskLevel,
          riskTitle: item.riskTitle,
          invoice: {
            id: item.invoice.id,
            number: item.invoice.number,
            kind: item.invoice.kind,
            status: item.invoice.status,
            workspace: item.invoice.workspace,
            requestedBy: item.invoice.requestedBy,
            plan: item.invoice.planVersion.plan
          },
          manualSubmission: item.manualSubmission
        })),
        walletTopups: walletTopups.map(item => ({
          id: item.id,
          number: item.number,
          amountMinor: item.amountMinor.toString(),
          currency: item.currency,
          dueAt: item.dueAt,
          createdAt: item.createdAt,
          workspace: item.workspace,
          requestedBy: item.requestedBy,
          latestPayment: item.payments[0] ?? null
        })),
        enterpriseInquiries: enterpriseInquiries.map(item => ({
          ...item,
          expectedStorageBytes:
            item.expectedStorageBytes?.toString() ?? null,
          expectedDeliveryBytes:
            item.expectedDeliveryBytes?.toString() ?? null,
          expectedMonthlyRequests:
            item.expectedMonthlyRequests?.toString() ?? null
        })),
        attentionSubscriptions: attentionSubscriptions.map(item => ({
          id: item.id,
          status: item.status,
          currency: item.currency,
          interval: item.interval,
          revenueModel: item.revenueModel,
          subscriptionTerm: item.subscriptionTerm,
          periodEnd: item.periodEnd,
          graceEndsAt: item.graceEndsAt,
          workspace: item.workspace,
          plan: {
            code: item.planVersion.plan.code,
            name: item.planVersion.plan.name,
            version: item.planVersion.version
          }
        }))
      },
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/console/wallets",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.extend({
      currency: z.enum(["BDT", "USD"]).optional(),
      status: z.enum(["ACTIVE", "FROZEN", "CLOSED"]).optional()
    }).parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      currency: query.currency,
      status: query.status,
      ...(query.query
        ? {
            workspace: {
              OR: [
                {
                  name: {
                    contains: query.query,
                    mode: "insensitive" as const
                  }
                },
                {
                  slug: {
                    contains: query.query,
                    mode: "insensitive" as const
                  }
                }
              ]
            }
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.prepaidWallet.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
        include: {
          workspace: {
            include: {
              billingPreference: true,
              subscription: {
                include: {
                  planVersion: {
                    include: { plan: true }
                  }
                }
              }
            }
          },
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 5
          }
        }
      }),
      prisma.prepaidWallet.count({ where })
    ]);

    res.json({
      data: items.map(item => ({
        ...item,
        balanceMinor: item.balanceMinor.toString(),
        reservedMinor: item.reservedMinor.toString(),
        availableMinor:
          (item.balanceMinor - item.reservedMinor).toString(),
        lowBalanceThresholdMinor:
          item.lowBalanceThresholdMinor.toString(),
        transactions: item.transactions.map(transaction => ({
          ...transaction,
          amountMinor:
            transaction.amountMinor.toString(),
          balanceAfterMinor:
            transaction.balanceAfterMinor.toString()
        }))
      })),
      meta: {
        requestId: req.id,
        page: query.page,
        limit: query.limit,
        total,
        totalPages:
          Math.max(1, Math.ceil(total / query.limit))
      }
    });
  })
);

router.post(
  "/console/wallets/:workspaceId/adjust",
  asyncHandler(async (req, res) => {
    const { workspaceId } = z.object({
      workspaceId: z.string().cuid()
    }).parse(req.params);
    const input = z.object({
      amountMinor: z.coerce.bigint().refine(
        value => value !== 0n,
        "Adjustment cannot be zero."
      ),
      reason: z.string().trim().min(3).max(500)
    }).parse(req.body);

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Workspace"
        WHERE "id" = ${workspaceId}
        FOR UPDATE
      `;

      const subscription =
        await tx.workspaceSubscription.findUnique({
          where: { workspaceId }
        });
      if (!subscription) {
        throw new AppError(
          404,
          "SUBSCRIPTION_NOT_FOUND",
          "Workspace subscription was not found."
        );
      }

      let wallet = await tx.prepaidWallet.findUnique({
        where: { workspaceId }
      });

      if (!wallet) {
        wallet = await tx.prepaidWallet.create({
          data: {
            workspaceId,
            currency: subscription.currency,
            lowBalanceThresholdMinor:
              defaultLowBalanceMinor(subscription.currency)
          }
        });
      }

      const nextBalance =
        wallet.balanceMinor + input.amountMinor;
      if (nextBalance < wallet.reservedMinor) {
        throw new AppError(
          409,
          "WALLET_ADJUSTMENT_INVALID",
          "The adjustment would reduce balance below reserved funds."
        );
      }

      const updated = await tx.prepaidWallet.update({
        where: { id: wallet.id },
        data: { balanceMinor: nextBalance }
      });

      const transaction =
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            workspaceId,
            kind:
              input.amountMinor > 0n
                ? "ADMIN_CREDIT"
                : "ADMIN_DEBIT",
            amountMinor: input.amountMinor,
            balanceAfterMinor: nextBalance,
            currency: wallet.currency,
            idempotencyKey:
              `admin-adjust:${randomUUID()}`,
            reference: input.reason,
            createdById: req.auth!.userId,
            metadata: { reason: input.reason }
          }
        });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: req.auth!.userId,
          action: "platform.wallet.adjusted",
          entityType: "PrepaidWallet",
          entityId: wallet.id,
          metadata: {
            amountMinor: input.amountMinor.toString(),
            balanceAfterMinor: nextBalance.toString(),
            reason: input.reason
          },
          ipAddress: req.ip
        }
      });

      return { wallet: updated, transaction };
    });

    res.json({
      data: {
        wallet: {
          ...result.wallet,
          balanceMinor:
            result.wallet.balanceMinor.toString(),
          reservedMinor:
            result.wallet.reservedMinor.toString()
        },
        transaction: {
          ...result.transaction,
          amountMinor:
            result.transaction.amountMinor.toString(),
          balanceAfterMinor:
            result.transaction.balanceAfterMinor.toString()
        }
      },
      meta: { requestId: req.id }
    });
  })
);


router.patch(
  "/console/wallets/:workspaceId",
  asyncHandler(async (req, res) => {
    const { workspaceId } = z.object({
      workspaceId: z.string().cuid()
    }).parse(req.params);
    const input = z.object({
      status: z.enum(["ACTIVE", "FROZEN", "CLOSED"]).optional(),
      currency: z.enum(["BDT", "USD"]).optional(),
      lowBalanceThresholdMinor:
        z.coerce.bigint().refine(
          value => value >= 0n,
          "Low-balance threshold cannot be negative."
        ).optional(),
      reason: z.string().trim().min(3).max(500)
    }).refine(
      value =>
        value.status !== undefined ||
        value.currency !== undefined ||
        value.lowBalanceThresholdMinor !== undefined,
      "At least one wallet setting must change."
    ).parse(req.body);

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Workspace"
        WHERE "id" = ${workspaceId}
        FOR UPDATE
      `;

      const subscription =
        await tx.workspaceSubscription.findUnique({
          where: { workspaceId }
        });
      if (!subscription) {
        throw new AppError(
          404,
          "SUBSCRIPTION_NOT_FOUND",
          "Workspace subscription was not found."
        );
      }

      let wallet = await tx.prepaidWallet.findUnique({
        where: { workspaceId }
      });
      if (!wallet) {
        wallet = await ensurePrepaidWalletInTransaction(
          tx,
          workspaceId,
          input.currency ?? subscription.currency
        );
      }

      if (
        input.currency &&
        input.currency !== wallet.currency &&
        (wallet.balanceMinor !== 0n || wallet.reservedMinor !== 0n)
      ) {
        throw new AppError(
          409,
          "WALLET_CURRENCY_LOCKED",
          "Wallet currency can change only when balance and reserved funds are zero."
        );
      }

      if (
        input.status === "CLOSED" &&
        wallet.reservedMinor > 0n
      ) {
        throw new AppError(
          409,
          "WALLET_HAS_RESERVED_FUNDS",
          "Release reserved funds before closing this wallet."
        );
      }

      const updated = await tx.prepaidWallet.update({
        where: { id: wallet.id },
        data: {
          status: input.status,
          currency: input.currency,
          lowBalanceThresholdMinor:
            input.lowBalanceThresholdMinor
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: req.auth!.userId,
          action: "platform.wallet.settings_updated",
          entityType: "PrepaidWallet",
          entityId: wallet.id,
          metadata: {
            reason: input.reason,
            before: {
              status: wallet.status,
              currency: wallet.currency,
              lowBalanceThresholdMinor:
                wallet.lowBalanceThresholdMinor.toString()
            },
            after: {
              status: updated.status,
              currency: updated.currency,
              lowBalanceThresholdMinor:
                updated.lowBalanceThresholdMinor.toString()
            }
          },
          ipAddress: req.ip
        }
      });

      return updated;
    });

    res.json({
      data: {
        ...result,
        balanceMinor: result.balanceMinor.toString(),
        reservedMinor: result.reservedMinor.toString(),
        availableMinor:
          (result.balanceMinor - result.reservedMinor).toString(),
        lowBalanceThresholdMinor:
          result.lowBalanceThresholdMinor.toString()
      },
      meta: { requestId: req.id }
    });
  })
);

router.get(
  "/console/enterprise-inquiries",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.extend({
      status: z.enum([
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "CLOSED_WON",
        "CLOSED_LOST"
      ]).optional()
    }).parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      status: query.status,
      ...(query.query
        ? {
            OR: [
              {
                companyName: {
                  contains: query.query,
                  mode: "insensitive" as const
                }
              },
              {
                email: {
                  contains: query.query,
                  mode: "insensitive" as const
                }
              }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.enterpriseInquiry.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.limit,
        include: {
          workspace: {
            select: { id: true, name: true, slug: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          },
          assignedTo: {
            select: { id: true, name: true, email: true }
          }
        }
      }),
      prisma.enterpriseInquiry.count({ where })
    ]);

    res.json({
      data: items.map(item => ({
        ...item,
        expectedStorageBytes:
          item.expectedStorageBytes?.toString() ?? null,
        expectedDeliveryBytes:
          item.expectedDeliveryBytes?.toString() ?? null,
        expectedMonthlyRequests:
          item.expectedMonthlyRequests?.toString() ?? null
      })),
      meta: {
        requestId: req.id,
        page: query.page,
        limit: query.limit,
        total,
        totalPages:
          Math.max(1, Math.ceil(total / query.limit))
      }
    });
  })
);

router.patch(
  "/console/enterprise-inquiries/:inquiryId",
  asyncHandler(async (req, res) => {
    const { inquiryId } = z.object({
      inquiryId: z.string().cuid()
    }).parse(req.params);
    const input = z.object({
      status: z.enum([
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "CLOSED_WON",
        "CLOSED_LOST"
      ]).optional(),
      assignedToId:
        z.string().cuid().nullable().optional(),
      adminNotes:
        z.string().trim().max(3000).nullable().optional()
    }).parse(req.body);

    const now = new Date();
    const inquiry = await prisma.enterpriseInquiry.update({
      where: { id: inquiryId },
      data: {
        status: input.status,
        assignedToId: input.assignedToId,
        adminNotes: input.adminNotes,
        contactedAt:
          input.status === "CONTACTED" ? now : undefined,
        closedAt:
          input.status === "CLOSED_WON" ||
          input.status === "CLOSED_LOST"
            ? now
            : undefined
      }
    }).catch(error => {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new AppError(
          404,
          "ENTERPRISE_INQUIRY_NOT_FOUND",
          "Enterprise inquiry was not found."
        );
      }
      throw error;
    });

    await adminAudit({
      actorId: req.auth!.userId,
      action: "platform.enterprise_inquiry.updated",
      entityType: "EnterpriseInquiry",
      entityId: inquiry.id,
      metadata: {
        status: inquiry.status,
        assignedToId: inquiry.assignedToId
      },
      ipAddress: req.ip
    });

    res.json({
      data: inquiry,
      meta: { requestId: req.id }
    });
  })
);

export default router;
