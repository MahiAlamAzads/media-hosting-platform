import { prisma, type Prisma } from "@media/database";
import type { UsageMetricName } from "./billing.types.js";
import {
  loadEntitlementsInTransaction,
  requireEntitlement
} from "./billing.service.js";
import {
  recordPaygLedgerInTransaction
} from "./payg.service.js";
import { scheduleUsageAlertEvaluation } from "./usage-alert.service.js";

export type RecordUsageInput = {
  workspaceId: string;
  metric: UsageMetricName;
  quantity: bigint;
  idempotencyKey: string;
  sourceType: string;
  sourceId?: string;
  occurredAt?: Date;
  metadata?: Prisma.InputJsonValue;
  paygOperationKey?: string;
};

async function lockWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Workspace"
    WHERE "id" = ${workspaceId}
    FOR UPDATE
  `;
}

export async function recordUsageInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordUsageInput
): Promise<boolean> {
  const occurredAt = input.occurredAt ?? new Date();

  await lockWorkspace(tx, input.workspaceId);

  const billing = await loadEntitlementsInTransaction(
    tx,
    input.workspaceId
  );

  const aggregate = await tx.usageAggregate.findUnique({
    where: {
      workspaceId_metric_periodStart_periodEnd: {
        workspaceId: input.workspaceId,
        metric: input.metric,
        periodStart: billing.periodStart,
        periodEnd: billing.periodEnd
      }
    },
    select: { quantity: true }
  });

  const currentBefore = aggregate?.quantity ?? 0n;

  const inserted = await tx.usageEvent.createMany({
    data: [{
      workspaceId: input.workspaceId,
      metric: input.metric,
      quantity: input.quantity,
      idempotencyKey: input.idempotencyKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadata: input.metadata,
      occurredAt
    }],
    skipDuplicates: true
  });

  if (inserted.count === 0) return false;

  const event = await tx.usageEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true }
  });

  if (!event) return false;

  await tx.usageAggregate.upsert({
    where: {
      workspaceId_metric_periodStart_periodEnd: {
        workspaceId: input.workspaceId,
        metric: input.metric,
        periodStart: billing.periodStart,
        periodEnd: billing.periodEnd
      }
    },
    create: {
      workspaceId: input.workspaceId,
      metric: input.metric,
      periodStart: billing.periodStart,
      periodEnd: billing.periodEnd,
      quantity: input.quantity,
      lastEventAt: occurredAt
    },
    update: {
      quantity: { increment: input.quantity },
      lastEventAt: occurredAt
    }
  });

  const entitlement = requireEntitlement(
    billing.values,
    input.metric
  );

  let includedLimit = entitlement.includedAmount;

  if (input.metric === "STORAGE_BYTES") {
    const workspace = await tx.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { storageLimitBytes: true }
    });

    if (
      workspace &&
      workspace.storageLimitBytes > includedLimit
    ) {
      includedLimit = workspace.storageLimitBytes;
    }
  }

  await recordPaygLedgerInTransaction(tx, {
    workspaceId: input.workspaceId,
    usageEventId: event.id,
    metric: input.metric,
    quantity: input.quantity,
    currentBefore,
    entitlement,
    includedLimit,
    currency: billing.currency,
    periodStart: billing.periodStart,
    periodEnd: billing.periodEnd,
    operationKey: input.paygOperationKey
  });

  return true;
}

export async function recordUsage(
  input: RecordUsageInput
): Promise<boolean> {
  const recorded = await prisma.$transaction(tx =>
    recordUsageInTransaction(tx, input)
  );

  if (recorded) {
    scheduleUsageAlertEvaluation(input.workspaceId);
  }

  return recorded;
}
