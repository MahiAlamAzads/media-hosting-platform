import { Router } from "express";
import { z } from "zod";
import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { requirePlatformAdmin } from "../../middleware/platform-admin.js";
import {
  createStorageReadStream,
  storageFileSize,
} from "../../infrastructure/storage.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { applyPaidPayment } from "../payments/payment.service.js";

const router = Router();
router.use(authenticate, requireUser, requirePlatformAdmin);

const idSchema = z.string().min(1).max(100);
const channelSchema = z.enum([
  "BANK_TRANSFER",
  "BKASH",
  "NAGAD",
  "ROCKET",
  "WISE",
  "PAYONEER",
  "OTHER",
]);

router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const status = z
      .enum([
        "PENDING",
        "PROCESSING",
        "UNDER_REVIEW",
        "PAID",
        "FAILED",
        "CANCELLED",
        "REJECTED",
        "EXPIRED",
        "REFUNDED",
      ])
      .optional()
      .parse(req.query.status);
    const method = z
      .enum(["MANUAL", "SSLCOMMERZ"])
      .optional()
      .parse(req.query.method);

    const payments = await prisma.paymentAttempt.findMany({
      where: { status, method },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        invoice: {
          include: {
            workspace: { select: { name: true, slug: true } },
            planVersion: { include: { plan: true } },
            requestedBy: { select: { name: true, email: true } },
          },
        },
        manualSubmission: { include: { account: true } },
      },
    });

    res.json({
      data: payments.map((payment) => ({
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
        invoice: {
          id: payment.invoice.id,
          number: payment.invoice.number,
          kind: payment.invoice.kind,
          currency: payment.invoice.currency,
          interval: payment.invoice.interval,
          amountMinor: payment.invoice.amountMinor.toString(),
          status: payment.invoice.status,
          dueAt: payment.invoice.dueAt,
          workspace: payment.invoice.workspace,
          planVersion: {
            id: payment.invoice.planVersion.id,
            version: payment.invoice.planVersion.version,
            plan: {
              id: payment.invoice.planVersion.plan.id,
              code: payment.invoice.planVersion.plan.code,
              name: payment.invoice.planVersion.plan.name,
            },
          },
          requestedBy: payment.invoice.requestedBy,
        },
        manualSubmission: payment.manualSubmission
          ? {
              id: payment.manualSubmission.id,
              transactionReference:
                payment.manualSubmission.transactionReference,
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
              account: {
                id: payment.manualSubmission.account.id,
                currency: payment.manualSubmission.account.currency,
                channel: payment.manualSubmission.account.channel,
                label: payment.manualSubmission.account.label,
                accountName: payment.manualSubmission.account.accountName,
                accountNumber: payment.manualSubmission.account.accountNumber,
                bankName: payment.manualSubmission.account.bankName,
                branchName: payment.manualSubmission.account.branchName,
                routingNumber: payment.manualSubmission.account.routingNumber,
                instructions: payment.manualSubmission.account.instructions,
              },
            }
          : null,
      })),
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/payments/:paymentId/approve",
  asyncHandler(async (req, res) => {
    const paymentId = idSchema.parse(req.params.paymentId);
    const input = z
      .object({
        note: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);

    const payment = await prisma.paymentAttempt.findUnique({
      where: { id: paymentId },
      include: { manualSubmission: true },
    });

    if (!payment || payment.status !== "UNDER_REVIEW") {
      throw new AppError(
        409,
        "PAYMENT_NOT_REVIEWABLE",
        "Payment is not awaiting review.",
      );
    }

    if (
      payment.method === "MANUAL" &&
      !payment.manualSubmission?.proofStorageKey &&
      env.MANUAL_PAYMENT_PROOF_REQUIRED
    ) {
      throw new AppError(
        409,
        "PAYMENT_PROOF_REQUIRED",
        "Manual payment proof is required before approval.",
      );
    }

    const result = await applyPaidPayment({
      paymentAttemptId: payment.id,
      actorId: req.auth!.userId,
      ipAddress: req.ip,
      note:
        input.note ??
        (payment.method === "MANUAL"
          ? "Manual payment approved by platform administrator."
          : "Risk-reviewed SSLCOMMERZ payment approved by platform administrator."),
    });

    if (payment.manualSubmission) {
      await prisma.manualPaymentSubmission.update({
        where: { paymentAttemptId: payment.id },
        data: {
          reviewedById: req.auth!.userId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
    }

    res.json({
      data: {
        paymentId: payment.id,
        invoiceId: result.invoice.id,
        status: "PAID",
      },
      meta: { requestId: req.id },
    });
  }),
);

router.post(
  "/payments/:paymentId/reject",
  asyncHandler(async (req, res) => {
    const paymentId = idSchema.parse(req.params.paymentId);
    const input = z
      .object({
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);

    const payment = await prisma.paymentAttempt.findUnique({
      where: { id: paymentId },
      include: { manualSubmission: true, invoice: true },
    });

    if (!payment || !new Set(["PENDING", "UNDER_REVIEW"]).has(payment.status)) {
      throw new AppError(
        409,
        "PAYMENT_NOT_REVIEWABLE",
        "Payment is not awaiting review.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          failureReason: input.reason,
          completedAt: new Date(),
        },
      });

      if (payment.manualSubmission) {
        await tx.manualPaymentSubmission.update({
          where: { paymentAttemptId: payment.id },
          data: {
            reviewedById: req.auth!.userId,
            reviewedAt: new Date(),
            rejectionReason: input.reason,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: payment.invoice.workspaceId,
          actorId: req.auth!.userId,
          action: "payment.rejected",
          entityType: "PaymentAttempt",
          entityId: payment.id,
          metadata: { reason: input.reason, method: payment.method },
          ipAddress: req.ip,
        },
      });
    });

    res.status(204).send();
  }),
);

router.get(
  "/payments/:paymentId/proof",
  asyncHandler(async (req, res) => {
    const paymentId = idSchema.parse(req.params.paymentId);
    const submission = await prisma.manualPaymentSubmission.findUnique({
      where: { paymentAttemptId: paymentId },
    });

    if (!submission?.proofStorageKey || !submission.proofContentType) {
      throw new AppError(
        404,
        "PAYMENT_PROOF_NOT_FOUND",
        "Payment proof was not found.",
      );
    }

    const size = await storageFileSize(submission.proofStorageKey);
    res.status(200);
    res.setHeader("content-type", submission.proofContentType);
    res.setHeader("content-length", size.toString());
    res.setHeader(
      "content-disposition",
      `inline; filename="${(submission.proofFilename ?? "payment-proof").replaceAll('"', "_")}"`,
    );

    const stream = createStorageReadStream(submission.proofStorageKey);
    stream.on("error", (error) => {
      req.log.error({ err: error }, "payment proof stream failed");
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            code: "PAYMENT_PROOF_STREAM_FAILED",
            message: "Payment proof could not be read.",
            requestId: req.id,
          },
        });
        return;
      }
      res.destroy(error instanceof Error ? error : undefined);
    });
    stream.pipe(res);
  }),
);

router.get(
  "/payment-accounts",
  asyncHandler(async (req, res) => {
    const accounts = await prisma.manualPaymentAccount.findMany({
      orderBy: [
        { currency: "asc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });
    res.json({ data: accounts, meta: { requestId: req.id } });
  }),
);

router.post(
  "/payment-accounts",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        currency: z.enum(["BDT", "USD"]),
        channel: channelSchema,
        label: z.string().trim().min(2).max(120),
        accountName: z.string().trim().min(2).max(160),
        accountNumber: z.string().trim().min(2).max(160),
        bankName: z.string().trim().max(160).nullable().optional(),
        branchName: z.string().trim().max(160).nullable().optional(),
        routingNumber: z.string().trim().max(80).nullable().optional(),
        instructions: z.string().trim().max(1000).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10000).default(0),
        isActive: z.boolean().default(true),
      })
      .parse(req.body);

    const account = await prisma.manualPaymentAccount.create({ data: input });
    res.status(201).json({ data: account, meta: { requestId: req.id } });
  }),
);

router.patch(
  "/payment-accounts/:accountId",
  asyncHandler(async (req, res) => {
    const accountId = idSchema.parse(req.params.accountId);
    const input = z
      .object({
        currency: z.enum(["BDT", "USD"]).optional(),
        channel: channelSchema.optional(),
        label: z.string().trim().min(2).max(120).optional(),
        accountName: z.string().trim().min(2).max(160).optional(),
        accountNumber: z.string().trim().min(2).max(160).optional(),
        bankName: z.string().trim().max(160).nullable().optional(),
        branchName: z.string().trim().max(160).nullable().optional(),
        routingNumber: z.string().trim().max(80).nullable().optional(),
        instructions: z.string().trim().max(1000).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10000).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    const result = await prisma.manualPaymentAccount.updateMany({
      where: { id: accountId },
      data: input,
    });

    if (result.count !== 1) {
      throw new AppError(
        404,
        "PAYMENT_ACCOUNT_NOT_FOUND",
        "Payment account was not found.",
      );
    }

    res.status(204).send();
  }),
);

export default router;
