import "../bootstrap.js";
import { prisma } from "@media/database";

const now = new Date();
const invoices = await prisma.billingInvoice.findMany({
  where: {
    kind: { in: ["PLAN_CHANGE", "WALLET_TOPUP"] },
    status: "OPEN",
    dueAt: { lte: now },
  },
  select: {
    id: true,
    kind: true,
    subscriptionChangeId: true,
  },
});

for (const invoice of invoices) {
  await prisma.$transaction(async (tx) => {
    await tx.billingInvoice.update({
      where: { id: invoice.id },
      data: { status: "EXPIRED" },
    });

    await tx.paymentAttempt.updateMany({
      where: {
        invoiceId: invoice.id,
        status: { in: ["PENDING", "PROCESSING", "UNDER_REVIEW"] },
      },
      data: {
        status: "EXPIRED",
        completedAt: now,
        failureReason:
          invoice.kind === "WALLET_TOPUP"
            ? "The wallet top-up invoice expired."
            : "The subscription invoice expired.",
      },
    });

    if (invoice.subscriptionChangeId) {
      await tx.subscriptionChange.updateMany({
        where: {
          id: invoice.subscriptionChangeId,
          status: "PAYMENT_PENDING",
        },
        data: {
          status: "CANCELLED",
          reviewedAt: now,
          note: "Invoice expired before payment.",
        },
      });
    }
  });
}

console.log(JSON.stringify({ expiredInvoices: invoices.length }));
