import { prisma, type Prisma } from "@media/database";
import { AppError } from "../../shared/http.js";
import {
  loadEntitlementsInTransaction,
  requireEntitlement
} from "./billing.service.js";
import type {
  EntitlementValue,
  UsageMetricName
} from "./billing.types.js";
import {
  ensurePaygCoverageInTransaction
} from "./payg.service.js";

export async function lockWorkspaceQuota(
  tx: Prisma.TransactionClient,
  workspaceId: string
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Workspace"
    WHERE "id" = ${workspaceId}
    FOR UPDATE
  `;

  if (rows.length !== 1) {
    throw new AppError(
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace was not found."
    );
  }
}

function assertCountWithinLimit(input: {
  metric: UsageMetricName;
  current: bigint;
  requested: bigint;
  entitlement: EntitlementValue;
}): void {
  const next = input.current + input.requested;

  if (
    input.entitlement.hardLimit &&
    !input.entitlement.overageAllowed &&
    next > input.entitlement.includedAmount
  ) {
    throw new AppError(
      413,
      "PLAN_LIMIT_EXCEEDED",
      `${input.metric} exceeds the current plan limit.`,
      {
        metric: input.metric,
        limit: input.entitlement.includedAmount.toString(),
        current: input.current.toString(),
        requested: input.requested.toString(),
        upgradeRequired: true,
        paygAvailable: false
      }
    );
  }
}

async function assertPaygAwareLimit(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    metric: UsageMetricName;
    current: bigint;
    requested: bigint;
    entitlement: EntitlementValue;
    currency: "BDT" | "USD";
    periodStart: Date;
    periodEnd: Date;
    operationKey: string;
    limitOverride?: bigint;
  }
): Promise<void> {
  await ensurePaygCoverageInTransaction(tx, {
    workspaceId: input.workspaceId,
    metric: input.metric,
    current: input.current,
    requested: input.requested,
    limit:
      input.limitOverride ??
      input.entitlement.includedAmount,
    hardLimit: input.entitlement.hardLimit,
    entitlement: input.entitlement,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    operationKey: input.operationKey
  });
}

export async function assertUploadAllowedInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    expectedBytes: bigint;
    operationKeyBase: string;
  }
): Promise<{
  periodStart: Date;
  periodEnd: Date;
  storageLimitBytes: bigint;
}> {
  await lockWorkspaceQuota(tx, input.workspaceId);

  const billing = await loadEntitlementsInTransaction(
    tx,
    input.workspaceId
  );

  const workspace = await tx.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      storageLimitBytes: true,
      storageUsedBytes: true,
      storageReservedBytes: true
    }
  });

  if (!workspace) {
    throw new AppError(
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace was not found."
    );
  }

  const maxFile = requireEntitlement(
    billing.values,
    "MAX_FILE_SIZE_BYTES"
  );

  assertCountWithinLimit({
    metric: "MAX_FILE_SIZE_BYTES",
    current: 0n,
    requested: input.expectedBytes,
    entitlement: maxFile
  });

  const storage = requireEntitlement(
    billing.values,
    "STORAGE_BYTES"
  );

  const effectiveStorageLimit =
    workspace.storageLimitBytes > storage.includedAmount
      ? workspace.storageLimitBytes
      : storage.includedAmount;

  await assertPaygAwareLimit(tx, {
    workspaceId: input.workspaceId,
    metric: "STORAGE_BYTES",
    current:
      workspace.storageUsedBytes + workspace.storageReservedBytes,
    requested: input.expectedBytes,
    entitlement: storage,
    currency: billing.currency,
    periodStart: billing.periodStart,
    periodEnd: billing.periodEnd,
    operationKey: `${input.operationKeyBase}:storage`,
    limitOverride: effectiveStorageLimit
  });

  const activeAssets = await tx.mediaAsset.count({
    where: {
      workspaceId: input.workspaceId,
      status: { in: ["UPLOADING", "PROCESSING", "READY"] },
      deletedAt: null
    }
  });

  const assets = requireEntitlement(
    billing.values,
    "ACTIVE_ASSETS"
  );

  assertCountWithinLimit({
    metric: "ACTIVE_ASSETS",
    current: BigInt(activeAssets),
    requested: 1n,
    entitlement: assets
  });

  const [currentUpload, uploadReservations] = await Promise.all([
    tx.usageAggregate.findUnique({
      where: {
        workspaceId_metric_periodStart_periodEnd: {
          workspaceId: input.workspaceId,
          metric: "UPLOAD_BYTES",
          periodStart: billing.periodStart,
          periodEnd: billing.periodEnd
        }
      },
      select: { quantity: true }
    }),
    tx.quotaReservation.aggregate({
      where: {
        workspaceId: input.workspaceId,
        metric: "UPLOAD_BYTES",
        status: "ACTIVE"
      },
      _sum: { quantity: true }
    })
  ]);

  const upload = requireEntitlement(
    billing.values,
    "UPLOAD_BYTES"
  );

  await assertPaygAwareLimit(tx, {
    workspaceId: input.workspaceId,
    metric: "UPLOAD_BYTES",
    current:
      (currentUpload?.quantity ?? 0n) +
      (uploadReservations._sum.quantity ?? 0n),
    requested: input.expectedBytes,
    entitlement: upload,
    currency: billing.currency,
    periodStart: billing.periodStart,
    periodEnd: billing.periodEnd,
    operationKey: `${input.operationKeyBase}:upload`
  });

  return {
    periodStart: billing.periodStart,
    periodEnd: billing.periodEnd,
    storageLimitBytes: effectiveStorageLimit
  };
}

export async function assertCountAllowedInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    metric:
      | "ACTIVE_ASSETS"
      | "FOLDERS"
      | "API_KEYS"
      | "WORKSPACE_MEMBERS"
      | "CONCURRENT_JOBS";
    current: bigint;
    requested?: bigint;
  }
): Promise<void> {
  await lockWorkspaceQuota(tx, input.workspaceId);

  const billing = await loadEntitlementsInTransaction(
    tx,
    input.workspaceId
  );

  const entitlement = requireEntitlement(
    billing.values,
    input.metric
  );

  assertCountWithinLimit({
    metric: input.metric,
    current: input.current,
    requested: input.requested ?? 1n,
    entitlement
  });
}

export async function assertStorageDeltaAllowedInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    deltaBytes: bigint;
    operationKey: string;
  }
): Promise<void> {
  if (input.deltaBytes <= 0n) return;

  await lockWorkspaceQuota(tx, input.workspaceId);
  const billing = await loadEntitlementsInTransaction(
    tx,
    input.workspaceId
  );
  const workspace = await tx.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      storageLimitBytes: true,
      storageUsedBytes: true,
      storageReservedBytes: true
    }
  });

  if (!workspace) {
    throw new AppError(
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace was not found."
    );
  }

  const storage = requireEntitlement(
    billing.values,
    "STORAGE_BYTES"
  );
  const effectiveLimit =
    workspace.storageLimitBytes > storage.includedAmount
      ? workspace.storageLimitBytes
      : storage.includedAmount;

  await assertPaygAwareLimit(tx, {
    workspaceId: input.workspaceId,
    metric: "STORAGE_BYTES",
    current:
      workspace.storageUsedBytes + workspace.storageReservedBytes,
    requested: input.deltaBytes,
    entitlement: storage,
    currency: billing.currency,
    periodStart: billing.periodStart,
    periodEnd: billing.periodEnd,
    operationKey: input.operationKey,
    limitOverride: effectiveLimit
  });
}

export async function assertMeteredUsageAllowed(
  workspaceId: string,
  metric:
    | "API_REQUESTS"
    | "DELIVERY_BYTES"
    | "IMAGE_TRANSFORMATIONS"
    | "VIDEO_PROCESSING_SECONDS"
    | "PROCESSING_CPU_MILLISECONDS",
  requested: bigint,
  operationKey: string
): Promise<void> {
  await prisma.$transaction(async tx => {
    await lockWorkspaceQuota(tx, workspaceId);

    const billing = await loadEntitlementsInTransaction(
      tx,
      workspaceId
    );
    const entitlement = requireEntitlement(
      billing.values,
      metric
    );

    const aggregate = await tx.usageAggregate.findUnique({
      where: {
        workspaceId_metric_periodStart_periodEnd: {
          workspaceId,
          metric,
          periodStart: billing.periodStart,
          periodEnd: billing.periodEnd
        }
      },
      select: { quantity: true }
    });

    await assertPaygAwareLimit(tx, {
      workspaceId,
      metric,
      current: aggregate?.quantity ?? 0n,
      requested,
      entitlement,
      currency: billing.currency,
      periodStart: billing.periodStart,
      periodEnd: billing.periodEnd,
      operationKey
    });
  });
}
