import express, { Router } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@media/database";
import { env } from "../../config/env.js";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import {
  overwriteStorageFile,
  removeStorageFile,
} from "../../infrastructure/storage.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import {
  assertInvoicePayable,
  getInvoiceForWorkspace,
} from "./payment.service.js";
import {
  createGatewayTransactionId,
  isValidPaymentProof,
} from "./payment.utils.js";
import { initiateSslcommerz } from "./sslcommerz.service.js";

const router = Router();
router.use(authenticate, requireUser);

const invoiceIdSchema = z.string().min(1).max(100);
const manualChannels = [
  "BANK_TRANSFER",
  "BKASH",
  "NAGAD",
  "ROCKET",
  "WISE",
  "PAYONEER",
  "OTHER",
] as const;

function requireBillingManager(role: "OWNER" | "ADMIN" | "MEMBER"): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError(
      403,
      "BILLING_PERMISSION_REQUIRED",
      "Workspace owner or admin access is required.",
    );
  }
}

function serializeManualAccount(account: {
  id: string;
  currency: "BDT" | "USD";
  channel: string;
  label: string;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  branchName: string | null;
  routingNumber: string | null;
  instructions: string | null;
}) {
  return {
    id: account.id,
    currency: account.currency,
    channel: account.channel,
    label: account.label,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    bankName: account.bankName,
    branchName: account.branchName,
    routingNumber: account.routingNumber,
    instructions: account.instructions,
  };
}

function serializeInvoice(
  invoice: Awaited<ReturnType<typeof getInvoiceForWorkspace>>,
) {
  return {
    id: invoice.id,
    number: invoice.number,
    kind: invoice.kind,
    currency: invoice.currency,
    interval: invoice.interval,
    amountMinor: invoice.amountMinor.toString(),
    status: invoice.status,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    planVersion: {
      id: invoice.planVersion.id,
      version: invoice.planVersion.version,
      plan: {
        id: invoice.planVersion.plan.id,
        code: invoice.planVersion.plan.code,
        name: invoice.planVersion.plan.name,
        description: invoice.planVersion.plan.description,
      },
    },
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amountMinor: payment.amountMinor.toString(),
      currency: payment.currency,
      providerTransactionId: payment.providerTransactionId,
      bankTransactionId: payment.bankTransactionId,
      riskLevel: payment.riskLevel,
      riskTitle: payment.riskTitle,
      failureReason: payment.failureReason,
      initiatedAt: payment.initiatedAt,
      completedAt: payment.completedAt,
      createdAt: payment.createdAt,
      manualSubmission: payment.manualSubmission
        ? {
            id: payment.manualSubmission.id,
            transactionReference: payment.manualSubmission.transactionReference,
            senderAccount: payment.manualSubmission.senderAccount,
            senderName: payment.manualSubmission.senderName,
            paidAt: payment.manualSubmission.paidAt,
            note: payment.manualSubmission.note,
            proofFilename: payment.manualSubmission.proofFilename,
            proofContentType: payment.manualSubmission.proofContentType,
            proofSizeBytes:
              payment.manualSubmission.proofSizeBytes?.toString() ?? null,
            hasProof: Boolean(payment.manualSubmission.proofStorageKey),
            reviewedAt: payment.manualSubmission.reviewedAt,
            rejectionReason: payment.manualSubmission.rejectionReason,
            account: serializeManualAccount(payment.manualSubmission.account),
          }
        : null,
    })),
  };
}

router.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        manualPaymentEnabled: env.MANUAL_PAYMENT_ENABLED,
        manualProofRequired: env.MANUAL_PAYMENT_PROOF_REQUIRED,
        manualProofMaxBytes: env.MANUAL_PAYMENT_PROOF_MAX_BYTES,
        sslcommerzEnabled: env.SSLCOMMERZ_ENABLED,
        sslcommerzSandbox: env.SSLCOMMERZ_SANDBOX,
        manualChannels,
      },
    });
  }),
);

router.get(
  "/manual-accounts",
  asyncHandler(async (req, res) => {
    const currency = z.enum(["BDT", "USD"]).parse(req.query.currency);
    const accounts = await prisma.manualPaymentAccount.findMany({
      where: { currency, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json({
      data: accounts.map(serializeManualAccount),
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const invoices = await prisma.billingInvoice.findMany({
      where: { workspaceId: req.auth!.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        planVersion: { include: { plan: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, method: true, status: true, createdAt: true },
        },
      },
    });

    res.json({
      data: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        kind: invoice.kind,
        currency: invoice.currency,
        interval: invoice.interval,
        amountMinor: invoice.amountMinor.toString(),
        status: invoice.status,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        dueAt: invoice.dueAt,
        paidAt: invoice.paidAt,
        voidedAt: invoice.voidedAt,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        planVersion: {
          id: invoice.planVersion.id,
          version: invoice.planVersion.version,
          plan: {
            id: invoice.planVersion.plan.id,
            code: invoice.planVersion.plan.code,
            name: invoice.planVersion.plan.name,
            description: invoice.planVersion.plan.description,
          },
        },
        payments: invoice.payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          status: payment.status,
          createdAt: payment.createdAt,
        })),
      })),
      meta: { requestId: req.id },
    });
  }),
);

router.get(
  "/invoices/:invoiceId",
  asyncHandler(async (req, res) => {
    const invoiceId = invoiceIdSchema.parse(req.params.invoiceId);
    const invoice = await getInvoiceForWorkspace(
      invoiceId,
      req.auth!.workspaceId,
    );
    res.json({ data: serializeInvoice(invoice), meta: { requestId: req.id } });
  }),
);

router.post(
  "/invoices/:invoiceId/manual",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);

    if (!env.MANUAL_PAYMENT_ENABLED) {
      throw new AppError(
        503,
        "MANUAL_PAYMENT_DISABLED",
        "Manual payment is currently disabled.",
      );
    }

    const invoiceId = invoiceIdSchema.parse(req.params.invoiceId);
    const input = z
      .object({
        accountId: z.string().min(1).max(100),
        transactionReference: z.string().trim().min(3).max(120),
        senderAccount: z.string().trim().max(120).nullable().optional(),
        senderName: z.string().trim().max(120).nullable().optional(),
        paidAt: z.coerce.date(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(req.body);

    if (input.paidAt > new Date(Date.now() + 5 * 60 * 1000)) {
      throw new AppError(
        422,
        "PAYMENT_DATE_INVALID",
        "Payment date cannot be in the future.",
      );
    }

    const invoice = await assertInvoicePayable(
      invoiceId,
      req.auth!.workspaceId,
    );

    const account = await prisma.manualPaymentAccount.findFirst({
      where: {
        id: input.accountId,
        currency: invoice.currency,
        isActive: true,
      },
    });

    if (!account) {
      throw new AppError(
        404,
        "PAYMENT_ACCOUNT_NOT_FOUND",
        "Selected manual payment account is unavailable.",
      );
    }

    const duplicateActive = invoice.payments.some((payment) =>
      new Set(["PENDING", "PROCESSING", "UNDER_REVIEW", "PAID"]).has(
        payment.status,
      ),
    );

    if (duplicateActive) {
      throw new AppError(
        409,
        "PAYMENT_ALREADY_IN_PROGRESS",
        "This invoice already has an active payment attempt.",
      );
    }

    const payment = await prisma.paymentAttempt
      .create({
        data: {
          invoiceId: invoice.id,
          method: "MANUAL",
          status: env.MANUAL_PAYMENT_PROOF_REQUIRED
            ? "PENDING"
            : "UNDER_REVIEW",
          amountMinor: invoice.amountMinor,
          currency: invoice.currency,
          initiatedAt: new Date(),
          manualSubmission: {
            create: {
              accountId: account.id,
              transactionReference: input.transactionReference,
              senderAccount: input.senderAccount,
              senderName: input.senderName,
              paidAt: input.paidAt,
              note: input.note,
            },
          },
        },
        include: { manualSubmission: true },
      })
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new AppError(
            409,
            "PAYMENT_REFERENCE_EXISTS",
            "This transaction reference has already been submitted for the selected account.",
          );
        }
        throw error;
      });

    await prisma.auditLog.create({
      data: {
        workspaceId: req.auth!.workspaceId,
        actorId: req.auth!.userId,
        action: "payment.manual_submitted",
        entityType: "PaymentAttempt",
        entityId: payment.id,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          transactionReference: input.transactionReference,
        },
        ipAddress: req.ip,
      },
    });

    res.status(201).json({
      data: {
        id: payment.id,
        status: payment.status,
        proofRequired: env.MANUAL_PAYMENT_PROOF_REQUIRED,
      },
      meta: { requestId: req.id },
    });
  }),
);

const proofTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

router.put(
  "/manual/:paymentId/proof",
  express.raw({
    type: Object.keys(proofTypes),
    limit: env.MANUAL_PAYMENT_PROOF_MAX_BYTES,
  }),
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);
    const paymentId = z.string().min(1).max(100).parse(req.params.paymentId);
    const contentType = req.get("content-type")?.split(";")[0] ?? "";
    const extension = proofTypes[contentType];

    if (
      !extension ||
      !Buffer.isBuffer(req.body) ||
      req.body.length === 0 ||
      !isValidPaymentProof(contentType, req.body)
    ) {
      throw new AppError(
        415,
        "INVALID_PAYMENT_PROOF",
        "Upload a JPEG, PNG, WebP or PDF payment proof.",
      );
    }

    const payment = await prisma.paymentAttempt.findFirst({
      where: {
        id: paymentId,
        method: "MANUAL",
        invoice: { workspaceId: req.auth!.workspaceId },
        status: { in: ["PENDING", "UNDER_REVIEW"] },
      },
      include: { manualSubmission: true },
    });

    if (!payment?.manualSubmission) {
      throw new AppError(
        404,
        "MANUAL_PAYMENT_NOT_FOUND",
        "Manual payment submission was not found.",
      );
    }

    const storageKey = `tenants/${req.auth!.workspaceId}/payment-proofs/${payment.id}.${extension}`;
    await overwriteStorageFile(storageKey, req.body);

    if (
      payment.manualSubmission.proofStorageKey &&
      payment.manualSubmission.proofStorageKey !== storageKey
    ) {
      await removeStorageFile(payment.manualSubmission.proofStorageKey).catch(
        () => undefined,
      );
    }

    const filename = (req.get("x-file-name") ?? `payment-proof.${extension}`)
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 160);

    await prisma.$transaction([
      prisma.manualPaymentSubmission.update({
        where: { paymentAttemptId: payment.id },
        data: {
          proofStorageKey: storageKey,
          proofFilename: filename,
          proofContentType: contentType,
          proofSizeBytes: BigInt(req.body.length),
        },
      }),
      prisma.paymentAttempt.update({
        where: { id: payment.id },
        data: { status: "UNDER_REVIEW" },
      }),
      prisma.auditLog.create({
        data: {
          workspaceId: req.auth!.workspaceId,
          actorId: req.auth!.userId,
          action: "payment.manual_proof_uploaded",
          entityType: "PaymentAttempt",
          entityId: payment.id,
          metadata: {
            filename,
            contentType,
            sizeBytes: req.body.length,
          },
          ipAddress: req.ip,
        },
      }),
    ]);

    res.json({
      data: { id: payment.id, status: "UNDER_REVIEW" },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/invoices/:invoiceId/sslcommerz",
  asyncHandler(async (req, res) => {
    requireBillingManager(req.auth!.role);
    const invoiceId = invoiceIdSchema.parse(req.params.invoiceId);
    const invoice = await assertInvoicePayable(
      invoiceId,
      req.auth!.workspaceId,
    );

    if (!env.SSLCOMMERZ_ENABLED) {
      throw new AppError(
        503,
        "SSLCOMMERZ_DISABLED",
        "SSLCOMMERZ payment is currently disabled.",
      );
    }

    if (
      invoice.payments.some((payment) =>
        new Set(["PENDING", "PROCESSING", "UNDER_REVIEW", "PAID"]).has(
          payment.status,
        ),
      )
    ) {
      throw new AppError(
        409,
        "PAYMENT_ALREADY_IN_PROGRESS",
        "This invoice already has an active payment attempt.",
      );
    }

    const [preference, user, workspace] = await Promise.all([
      prisma.billingPreference.findUnique({
        where: { workspaceId: req.auth!.workspaceId },
      }),
      prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: { name: true, email: true },
      }),
      prisma.workspace.findUnique({
        where: { id: req.auth!.workspaceId },
        select: { name: true },
      }),
    ]);

    const address = preference?.billingAddress as
      | null
      | undefined
      | {
          line1?: string;
          city?: string;
          region?: string;
          postalCode?: string;
          countryCode?: string;
        };
    const customerEmail = preference?.billingEmail ?? user?.email;
    const customerName =
      preference?.companyName ?? user?.name ?? workspace?.name;
    const customerPhone = preference?.billingPhone;

    if (
      !customerEmail ||
      !customerName ||
      !customerPhone ||
      !address?.line1 ||
      !address.city ||
      !(address.countryCode ?? preference?.countryCode)
    ) {
      throw new AppError(
        422,
        "BILLING_DETAILS_REQUIRED",
        "Complete billing name, email, phone and address before starting SSLCOMMERZ checkout.",
      );
    }

    const transactionId = createGatewayTransactionId();
    const payment = await prisma.paymentAttempt.create({
      data: {
        invoiceId: invoice.id,
        method: "SSLCOMMERZ",
        status: "PROCESSING",
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        providerTransactionId: transactionId,
        initiatedAt: new Date(),
      },
    });

    try {
      const session = await initiateSslcommerz({
        transactionId,
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        subscriptionChangeId: invoice.subscriptionChangeId,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        customerName,
        customerEmail,
        customerPhone,
        addressLine1: address.line1,
        city: address.city,
        region: address.region ?? null,
        postalCode: address.postalCode ?? null,
        country: address.countryCode ?? preference?.countryCode ?? "BD",
        productName: `${invoice.planVersion.plan.name} subscription`,
      });

      await prisma.$transaction([
        prisma.paymentAttempt.update({
          where: { id: payment.id },
          data: {
            gatewaySessionId: session.sessionKey,
            rawInitiation: session.raw as Prisma.InputJsonValue,
          },
        }),
        prisma.auditLog.create({
          data: {
            workspaceId: req.auth!.workspaceId,
            actorId: req.auth!.userId,
            action: "payment.sslcommerz_started",
            entityType: "PaymentAttempt",
            entityId: payment.id,
            metadata: {
              invoiceId: invoice.id,
              transactionId,
              sandbox: env.SSLCOMMERZ_SANDBOX,
            },
            ipAddress: req.ip,
          },
        }),
      ]);

      res.status(201).json({
        data: {
          paymentId: payment.id,
          transactionId,
          gatewayPageUrl: session.gatewayPageUrl,
          sandbox: env.SSLCOMMERZ_SANDBOX,
        },
        meta: { requestId: req.id },
      });
    } catch (error) {
      await prisma.paymentAttempt.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureReason:
            error instanceof Error
              ? error.message
              : "Gateway initiation failed.",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }),
);

export default router;
