import "../bootstrap.js";
import { prisma, Prisma } from "@media/database";
import { env } from "../config/env.js";
import { applyPaidPayment } from "../modules/payments/payment.service.js";
import { validateGatewayRecord } from "../modules/payments/payment.utils.js";
import {
  querySslcommerzTransaction,
  validateSslcommerzPayment
} from "../modules/payments/sslcommerz.service.js";

if (!env.SSLCOMMERZ_ENABLED) {
  console.log(JSON.stringify({ skipped: true, reason: "SSLCOMMERZ disabled" }));
  process.exit(0);
}

const attempts = await prisma.paymentAttempt.findMany({
  where: {
    method: "SSLCOMMERZ",
    status: "PROCESSING",
    providerTransactionId: { not: null },
    createdAt: { lte: new Date(Date.now() - 5 * 60 * 1000) }
  },
  include: { invoice: true },
  take: 100
});

let paid = 0;
let failed = 0;

for (const attempt of attempts) {
  const transactionId = attempt.providerTransactionId;
  if (!transactionId) continue;

  try {
    const records = await querySslcommerzTransaction(transactionId);
    const record = records.find(item =>
      new Set(["VALID", "VALIDATED"]).has(String(item.status))
    );

    if (!record?.val_id) {
      const terminal = records.find(item =>
        new Set(["FAILED", "CANCELLED"]).has(String(item.status))
      );
      if (terminal) {
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: terminal.status === "CANCELLED" ? "CANCELLED" : "FAILED",
            rawValidation: terminal as Prisma.InputJsonValue,
            completedAt: new Date()
          }
        });
        failed += 1;
      }
      continue;
    }

    const validation = await validateSslcommerzPayment(String(record.val_id));
    const risk = validateGatewayRecord({
      record: validation,
      invoiceId: attempt.invoiceId,
      workspaceId: attempt.invoice.workspaceId,
      transactionId,
      currency: attempt.invoice.currency,
      amountMinor: attempt.invoice.amountMinor
    });

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        validationId: String(record.val_id),
        bankTransactionId:
          typeof validation.bank_tran_id === "string"
            ? validation.bank_tran_id
            : null,
        riskLevel: risk.riskLevel,
        riskTitle: risk.riskTitle,
        rawValidation: validation as Prisma.InputJsonValue,
        status:
          risk.riskLevel === 1 && !env.SSLCOMMERZ_AUTO_APPROVE_RISKY
            ? "UNDER_REVIEW"
            : "PROCESSING"
      }
    });

    if (risk.riskLevel === 1 && !env.SSLCOMMERZ_AUTO_APPROVE_RISKY) {
      continue;
    }

    await applyPaidPayment({
      paymentAttemptId: attempt.id,
      note: "SSLCOMMERZ payment reconciled and applied."
    });
    paid += 1;
  } catch (error) {
    console.error(JSON.stringify({
      paymentAttemptId: attempt.id,
      error: error instanceof Error ? error.message : String(error)
    }));
  }
}

console.log(JSON.stringify({ checked: attempts.length, paid, failed }));
