import "../bootstrap.js";
import { prisma, Prisma } from "@media/database";
import { env } from "../config/env.js";
import {
  getSubscriptionCommitmentBounds,
  subscriptionTermToInterval,
} from "../modules/billing/billing.utils.js";
import { createRenewalInvoice } from "../modules/payments/payment.service.js";

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

const now = new Date();
const leadEnd = addDays(now, env.PAYMENT_RENEWAL_LEAD_DAYS);

const subscriptions = await prisma.workspaceSubscription.findMany({
  where: {
    revenueModel: "SUBSCRIPTION",
    subscriptionTerm: {
      in: ["THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"],
    },
    status: {
      in: ["ACTIVE", "TRIALING", "GRACE_PERIOD", "PAST_DUE"],
    },
    commitmentEndsAt: {
      not: null,
      lte: leadEnd,
    },
  },
  include: {
    planVersion: {
      include: {
        plan: true,
        offers: true,
      },
    },
    workspace: {
      include: {
        members: {
          where: { role: "OWNER" },
          take: 1,
          include: {
            user: { select: { id: true } },
          },
        },
      },
    },
  },
  orderBy: { commitmentEndsAt: "asc" },
  take: 500,
});

let created = 0;
let skippedMissingOwner = 0;
let skippedMissingOffer = 0;

for (const subscription of subscriptions) {
  const commitmentEnd = subscription.commitmentEndsAt;
  if (!commitmentEnd) continue;

  const approvedChange = await prisma.subscriptionChange.findFirst({
    where: {
      workspaceId: subscription.workspaceId,
      status: "APPROVED",
      effectiveAt: { lte: commitmentEnd },
    },
    orderBy: { createdAt: "desc" },
    include: {
      requestedPlanVersion: {
        include: {
          plan: true,
          offers: true,
        },
      },
    },
  });

  const targetVersion =
    approvedChange?.requestedPlanVersion ?? subscription.planVersion;
  const currency = approvedChange?.currency ?? subscription.currency;
  const term =
    approvedChange?.subscriptionTerm ?? subscription.subscriptionTerm;
  const interval = subscriptionTermToInterval(term);

  const offer = targetVersion.offers.find(
    (item) => item.currency === currency && item.term === term && item.isActive,
  );

  if (!offer || offer.amountMinor <= 0n) {
    skippedMissingOffer += 1;
    continue;
  }

  const ownerId = subscription.workspace.members[0]?.user.id;
  if (!ownerId) {
    skippedMissingOwner += 1;
    continue;
  }

  const commitment = getSubscriptionCommitmentBounds(commitmentEnd, term);
  const renewalKey = [
    "renewal",
    subscription.workspaceId,
    commitmentEnd.toISOString(),
    targetVersion.id,
    currency,
    term,
  ].join(":");

  try {
    await prisma.$transaction((tx) =>
      createRenewalInvoice(tx, {
        renewalKey,
        workspaceId: subscription.workspaceId,
        subscriptionChangeId: approvedChange?.id ?? null,
        requestedById: ownerId,
        planVersionId: targetVersion.id,
        currency,
        interval,
        subscriptionTerm: term,
        amountMinor: offer.amountMinor,
        planCode: targetVersion.plan.code,
        planName: targetVersion.plan.name,
        planVersion: targetVersion.version,
        periodStart: commitment.start,
        periodEnd: commitment.end,
        dueAt: addDays(commitmentEnd, env.PAYMENT_GRACE_DAYS),
      }),
    );
    created += 1;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      continue;
    }
    throw error;
  }
}

console.log(
  JSON.stringify({
    checked: subscriptions.length,
    created,
    skippedMissingOwner,
    skippedMissingOffer,
  }),
);
