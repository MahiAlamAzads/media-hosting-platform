import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import { prisma, Prisma } from "@media/database";
import { env } from "../../config/env.js";
import { AppError, asyncHandler } from "../../shared/http.js";
import { applyPaidPayment } from "./payment.service.js";
import { validateGatewayRecord } from "./payment.utils.js";
import { validateSslcommerzPayment } from "./sslcommerz.service.js";

const router = Router();

function flatPayload(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      String(item ?? ""),
    ]),
  );
}

function callbackPayload(req: Request): Record<string, string> {
  return {
    ...flatPayload(req.query),
    ...flatPayload(req.body),
  };
}

function redirectUrl(invoiceId: string | null, state: string): string {
  const target = invoiceId
    ? `/dashboard/billing/payments/${encodeURIComponent(invoiceId)}`
    : "/dashboard/billing/payments";
  return `${env.WEB_URL}${target}?payment=${encodeURIComponent(state)}`;
}

async function recordWebhook(payload: Record<string, string>) {
  const rawKey = [
    payload.tran_id,
    payload.status,
    payload.val_id,
    payload.bank_tran_id,
    JSON.stringify(payload),
  ].join(":");
  const eventKey = `SSLCOMMERZ:${createHash("sha256").update(rawKey).digest("hex")}`;

  return prisma.paymentWebhookEvent.upsert({
    where: { eventKey },
    create: {
      provider: "SSLCOMMERZ",
      eventKey,
      transactionId: payload.tran_id || null,
      payload: payload as Prisma.InputJsonValue,
    },
    update: {},
    select: { id: true, processedAt: true },
  });
}

async function processSuccessfulNotification(payload: Record<string, string>) {
  if (!payload.tran_id || !payload.val_id) {
    throw new AppError(
      422,
      "PAYMENT_NOTIFICATION_INVALID",
      "SSLCOMMERZ transaction or validation ID is missing.",
    );
  }

  const event = await recordWebhook(payload);
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { providerTransactionId: payload.tran_id },
    include: { invoice: true },
  });

  if (!attempt || attempt.method !== "SSLCOMMERZ") {
    throw new AppError(
      404,
      "PAYMENT_NOT_FOUND",
      "SSLCOMMERZ payment attempt was not found.",
    );
  }

  if (
    event.processedAt &&
    (attempt.status === "PAID" || attempt.invoice.status === "PAID")
  ) {
    return { invoiceId: attempt.invoiceId, state: "paid" };
  }

  const validation = await validateSslcommerzPayment(payload.val_id);
  const risk = validateGatewayRecord({
    record: validation,
    invoiceId: attempt.invoice.id,
    workspaceId: attempt.invoice.workspaceId,
    transactionId: payload.tran_id,
    currency: attempt.invoice.currency,
    amountMinor: attempt.invoice.amountMinor,
  });

  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      validationId: payload.val_id,
      bankTransactionId:
        typeof validation.bank_tran_id === "string"
          ? validation.bank_tran_id
          : payload.bank_tran_id || null,
      riskLevel: risk.riskLevel,
      riskTitle: risk.riskTitle,
      rawNotification: payload as Prisma.InputJsonValue,
      rawValidation: validation as Prisma.InputJsonValue,
      status:
        risk.riskLevel === 1 && !env.SSLCOMMERZ_AUTO_APPROVE_RISKY
          ? "UNDER_REVIEW"
          : "PROCESSING",
    },
  });

  if (risk.riskLevel === 1 && !env.SSLCOMMERZ_AUTO_APPROVE_RISKY) {
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
    return { invoiceId: attempt.invoiceId, state: "review" };
  }

  await applyPaidPayment({
    paymentAttemptId: attempt.id,
    note: "SSLCOMMERZ payment validated and applied.",
    ipAddress: null,
  });

  await prisma.paymentWebhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() },
  });

  return { invoiceId: attempt.invoiceId, state: "paid" };
}

async function processFailure(
  payload: Record<string, string>,
  status: "FAILED" | "CANCELLED",
) {
  const event = await recordWebhook(payload);

  try {
    let invoiceId: string | null = null;

    if (payload.tran_id) {
      const attempt = await prisma.paymentAttempt.findUnique({
        where: { providerTransactionId: payload.tran_id },
        select: { id: true, invoiceId: true, status: true },
      });

      if (attempt) {
        invoiceId = attempt.invoiceId;

        if (attempt.status === "PROCESSING") {
          await prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status,
              rawNotification: payload as Prisma.InputJsonValue,
              failureReason:
                status === "CANCELLED"
                  ? "Customer cancelled the SSLCOMMERZ checkout."
                  : payload.error || "SSLCOMMERZ payment failed.",
              completedAt: new Date(),
            },
          });
        }
      }
    }

    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        processingError: null,
      },
    });

    return invoiceId;
  } catch (error) {
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        processingError:
          error instanceof Error
            ? error.message
            : "Payment failure notification processing failed.",
      },
    });
    throw error;
  }
}

router.post(
  "/ipn",
  asyncHandler(async (req, res) => {
    const payload = callbackPayload(req);

    try {
      const status = String(payload.status ?? "").toUpperCase();

      if (new Set(["VALID", "VALIDATED"]).has(status)) {
        const result = await processSuccessfulNotification(payload);
        res.json({ received: true, state: result.state });
        return;
      }

      if (status === "FAILED" || status === "CANCELLED") {
        await processFailure(payload, status);
      } else {
        const event = await recordWebhook(payload);
        await prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            processedAt: new Date(),
            processingError: null,
          },
        });
      }

      res.json({ received: true });
    } catch (error) {
      const event = await recordWebhook(payload);
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingError:
            error instanceof Error ? error.message : "IPN processing failed.",
        },
      });
      throw error;
    }
  }),
);

router.all(
  "/success",
  asyncHandler(async (req, res) => {
    const payload = callbackPayload(req);
    const invoiceId = payload.value_a || null;

    try {
      const result = await processSuccessfulNotification(payload);
      res.redirect(303, redirectUrl(result.invoiceId, result.state));
    } catch (error) {
      const event = await recordWebhook(payload);
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingError:
            error instanceof Error
              ? error.message
              : "Success callback verification failed.",
        },
      });
      res.redirect(303, redirectUrl(invoiceId, "verification-failed"));
    }
  }),
);

router.all(
  "/fail",
  asyncHandler(async (req, res) => {
    const payload = callbackPayload(req);
    const invoiceId = await processFailure(payload, "FAILED");
    res.redirect(
      303,
      redirectUrl(invoiceId ?? payload.value_a ?? null, "failed"),
    );
  }),
);

router.all(
  "/cancel",
  asyncHandler(async (req, res) => {
    const payload = callbackPayload(req);
    const invoiceId = await processFailure(payload, "CANCELLED");
    res.redirect(
      303,
      redirectUrl(invoiceId ?? payload.value_a ?? null, "cancelled"),
    );
  }),
);

export default router;
