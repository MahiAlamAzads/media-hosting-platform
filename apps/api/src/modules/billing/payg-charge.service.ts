import { prisma } from "@media/database";
import { AppError } from "../../shared/http.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { chargeStripeOffSession } from "../payments/stripe-payg.service.js";

function formatMinor(amountMinor: bigint, currency: "BDT" | "USD"): string {
  const absolute = amountMinor < 0n ? -amountMinor : amountMinor;
  const major = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const sign = amountMinor < 0n ? "-" : "";
  return currency === "BDT"
    ? `${sign}৳${major}.${fraction}`
    : `${sign}$${major}.${fraction}`;
}

async function notifyFailure(input: {
  workspaceId: string;
  amountMinor: bigint;
  currency: "BDT" | "USD";
  reason: string;
}): Promise<void> {
  const [workspace, preference, owner] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true }
    }),
    prisma.billingPreference.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { billingEmail: true }
    }),
    prisma.workspaceMember.findFirst({
      where: {
        workspaceId: input.workspaceId,
        role: "OWNER"
      },
      include: {
        user: {
          select: { email: true }
        }
      }
    })
  ]);

  const recipient =
    preference?.billingEmail ??
    owner?.user.email;

  if (!recipient) return;

  const formatted = formatMinor(input.amountMinor, input.currency);

  await sendSecurityEmail({
    to: recipient,
    subject: "Pay-as-you-go card charge failed",
    text:
      `The automatic PAYG charge of ${formatted} for ` +
      `${workspace?.name ?? "your workspace"} failed.\n\n` +
      `${input.reason}\n\n` +
      "PAYG has been paused and hard limits are active again. " +
      "Update the saved payment method in Billing > Pay as you go.",
    html:
      `<p>The automatic PAYG charge of <strong>${formatted}</strong> for ` +
      `<strong>${workspace?.name ?? "your workspace"}</strong> failed.</p>` +
      `<p>${input.reason}</p>` +
      `<p>PAYG has been paused and hard limits are active again. ` +
      `Update the saved payment method in Billing &gt; Pay as you go.</p>`
  }).catch(() => undefined);
}

export async function chargePendingPaygForWorkspace(
  workspaceId: string,
  force = false
): Promise<boolean> {
  const prepared = await prisma.$transaction(async tx => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Workspace"
      WHERE "id" = ${workspaceId}
      FOR UPDATE
    `;

    const policy = await tx.paygPolicy.findUnique({
      where: { workspaceId },
      include: {
        defaultPaymentMethod: {
          include: {
            providerCustomer: true
          }
        },
        workspace: {
          include: {
            subscription: true
          }
        }
      }
    });

    if (
      !policy ||
      policy.status === "PAUSED_PAYMENT_FAILED" ||
      !policy.defaultPaymentMethod ||
      policy.defaultPaymentMethod.status !== "ACTIVE"
    ) {
      return null;
    }

    const oldestEntry = await tx.paygLedgerEntry.findFirst({
      where: {
        workspaceId,
        status: "PENDING",
        chargeAttemptId: null
      },
      orderBy: [
        { periodStart: "asc" },
        { createdAt: "asc" }
      ]
    });

    if (!oldestEntry) return null;

    const periodStart = oldestEntry.periodStart;
    const periodEnd = oldestEntry.periodEnd;
    const currency = oldestEntry.currency;

    const entries = await tx.paygLedgerEntry.findMany({
      where: {
        workspaceId,
        status: "PENDING",
        chargeAttemptId: null,
        periodStart,
        periodEnd,
        currency
      },
      orderBy: { createdAt: "asc" },
      take: 500
    });

    const amountMinor = entries.reduce(
      (total, entry) => total + entry.amountMinor,
      0n
    );

    const periodClosingSoon =
      periodEnd.getTime() <= Date.now() + 60 * 60 * 1000;

    if (
      !force &&
      policy.status === "ACTIVE" &&
      !periodClosingSoon &&
      amountMinor < policy.chargeThresholdMinor
    ) {
      return null;
    }

    const attempt = await tx.paygChargeAttempt.create({
      data: {
        workspaceId,
        paymentMethodId: policy.defaultPaymentMethod.id,
        currency,
        amountMinor,
        status: "PROCESSING",
        initiatedAt: new Date(),
        periodStart,
        periodEnd
      }
    });

    const assigned = await tx.paygLedgerEntry.updateMany({
      where: {
        id: { in: entries.map(entry => entry.id) },
        status: "PENDING",
        chargeAttemptId: null
      },
      data: {
        chargeAttemptId: attempt.id
      }
    });

    if (assigned.count !== entries.length) {
      throw new AppError(
        409,
        "PAYG_CHARGE_CONFLICT",
        "PAYG usage changed while preparing the card charge."
      );
    }

    return {
      attempt,
      amountMinor,
      currency,
      provider: policy.defaultPaymentMethod.provider,
      providerCustomerId:
        policy.defaultPaymentMethod.providerCustomer.providerCustomerId,
      providerPaymentMethodId:
        policy.defaultPaymentMethod.providerPaymentMethodId
    };
  });

  if (!prepared) return false;

  try {
    if (prepared.provider !== "STRIPE") {
      throw new AppError(
        503,
        "PAYG_PROVIDER_UNAVAILABLE",
        "The saved-card provider does not support automatic charging."
      );
    }

    const intent = await chargeStripeOffSession({
      customerId: prepared.providerCustomerId,
      paymentMethodId: prepared.providerPaymentMethodId,
      amountMinor: prepared.amountMinor,
      currency: prepared.currency,
      workspaceId,
      chargeAttemptId: prepared.attempt.id
    });

    const succeeded = intent.status === "succeeded";

    await prisma.$transaction(async tx => {
      await tx.paygChargeAttempt.update({
        where: { id: prepared.attempt.id },
        data: {
          status: succeeded ? "PAID" : "REQUIRES_ACTION",
          providerPaymentIntentId:
            intent.id ? String(intent.id) : null,
          completedAt: succeeded ? new Date() : null,
          failureCode: succeeded
            ? null
            : String(intent.status ?? "requires_action"),
          failureReason: succeeded
            ? null
            : "The card issuer requires customer action."
        }
      });

      await tx.paygLedgerEntry.updateMany({
        where: { chargeAttemptId: prepared.attempt.id },
        data: {
          status: succeeded ? "CHARGED" : "FAILED"
        }
      });

      if (!succeeded) {
        await tx.paygPolicy.update({
          where: { workspaceId },
          data: {
            status: "PAUSED_PAYMENT_FAILED",
            pausedAt: new Date(),
            pauseReason:
              "The saved card requires customer authentication."
          }
        });
      }
    });

    if (!succeeded) {
      await notifyFailure({
        workspaceId,
        amountMinor: prepared.amountMinor,
        currency: prepared.currency,
        reason:
          "The card issuer requires customer authentication."
      });
    }

    return succeeded;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Automatic card charge failed.";

    await prisma.$transaction(async tx => {
      await tx.paygChargeAttempt.update({
        where: { id: prepared.attempt.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          failureReason: reason
        }
      });

      await tx.paygLedgerEntry.updateMany({
        where: { chargeAttemptId: prepared.attempt.id },
        data: { status: "FAILED" }
      });

      await tx.paygPolicy.update({
        where: { workspaceId },
        data: {
          status: "PAUSED_PAYMENT_FAILED",
          pausedAt: new Date(),
          pauseReason: reason
        }
      });
    });

    await notifyFailure({
      workspaceId,
      amountMinor: prepared.amountMinor,
      currency: prepared.currency,
      reason
    });

    return false;
  }
}

export async function chargePendingPayg(
  force = false
): Promise<{
  checked: number;
  charged: number;
}> {
  const pendingWorkspaces = await prisma.paygLedgerEntry.findMany({
    where: {
      status: "PENDING",
      chargeAttemptId: null,
      workspace: {
        paygPolicy: {
          is: {
            status: { in: ["ACTIVE", "DISABLED"] }
          }
        }
      }
    },
    distinct: ["workspaceId"],
    select: { workspaceId: true }
  });

  let charged = 0;

  for (const policy of pendingWorkspaces) {
    if (
      await chargePendingPaygForWorkspace(
        policy.workspaceId,
        force
      )
    ) {
      charged += 1;
    }
  }

  return {
    checked: pendingWorkspaces.length,
    charged
  };
}
