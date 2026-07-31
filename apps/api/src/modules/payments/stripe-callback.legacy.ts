import { Router } from "express";
import { prisma, Prisma } from "@media/database";
import { asyncHandler } from "../../shared/http.js";
import { syncStripeSetupSession } from "../billing/payg-payment-method.service.js";
import { verifyStripeWebhook } from "./stripe-payg.service.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body ?? "");

    verifyStripeWebhook(rawBody, req.get("stripe-signature"));

    const event = JSON.parse(rawBody.toString("utf8")) as Record<string, any>;
    const eventId = String(event.id ?? "");

    if (!eventId) {
      res.status(400).json({
        error: {
          code: "STRIPE_EVENT_ID_MISSING",
          message: "Stripe webhook event ID is missing.",
          requestId: req.id,
        },
      });
      return;
    }

    const stored = await prisma.paymentWebhookEvent.upsert({
      where: { eventKey: `STRIPE:${eventId}` },
      create: {
        provider: "STRIPE",
        eventKey: `STRIPE:${eventId}`,
        transactionId: event.data?.object?.id
          ? String(event.data.object.id)
          : null,
        payload: event as Prisma.InputJsonValue,
      },
      update: {},
      select: {
        id: true,
        processedAt: true,
      },
    });

    if (stored.processedAt) {
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      const object = event.data?.object ?? {};

      if (
        event.type === "checkout.session.completed" &&
        object.mode === "setup"
      ) {
        await syncStripeSetupSession(String(object.id));
      }

      if (
        event.type === "payment_intent.succeeded" ||
        event.type === "payment_intent.payment_failed"
      ) {
        const chargeAttemptId = String(
          object.metadata?.paygChargeAttemptId ?? "",
        );

        if (chargeAttemptId) {
          const succeeded = event.type === "payment_intent.succeeded";

          await prisma.$transaction(async (tx) => {
            const attempt = await tx.paygChargeAttempt.findUnique({
              where: { id: chargeAttemptId },
            });

            if (!attempt) return;

            await tx.paygChargeAttempt.update({
              where: { id: attempt.id },
              data: {
                status: succeeded ? "PAID" : "FAILED",
                providerPaymentIntentId: String(object.id),
                completedAt: new Date(),
                failureCode: object.last_payment_error?.code ?? null,
                failureReason: object.last_payment_error?.message ?? null,
              },
            });

            await tx.paygLedgerEntry.updateMany({
              where: { chargeAttemptId: attempt.id },
              data: {
                status: succeeded ? "CHARGED" : "FAILED",
              },
            });

            if (succeeded) {
              await tx.paygPolicy.updateMany({
                where: {
                  workspaceId: attempt.workspaceId,
                  status: "PAUSED_PAYMENT_FAILED",
                },
                data: {
                  status: "ACTIVE",
                  pausedAt: null,
                  pauseReason: null,
                },
              });
            } else {
              await tx.paygPolicy.updateMany({
                where: { workspaceId: attempt.workspaceId },
                data: {
                  status: "PAUSED_PAYMENT_FAILED",
                  pausedAt: new Date(),
                  pauseReason:
                    object.last_payment_error?.message ??
                    "Automatic PAYG card charge failed.",
                },
              });
            }
          });
        }
      }

      await prisma.paymentWebhookEvent.update({
        where: { id: stored.id },
        data: {
          processedAt: new Date(),
          processingError: null,
        },
      });

      res.json({ received: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Stripe webhook processing failed.";

      await prisma.paymentWebhookEvent.update({
        where: { id: stored.id },
        data: { processingError: message },
      });

      throw error;
    }
  }),
);

export default router;
