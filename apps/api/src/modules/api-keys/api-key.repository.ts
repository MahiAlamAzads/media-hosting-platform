import { prisma } from "@media/database";
import {
  assertCountAllowedInTransaction,
  lockWorkspaceQuota
} from "../billing/quota.service.js";
import { recordUsageInTransaction } from "../billing/usage.service.js";

export class ApiKeyRepository {
  list(workspaceId: string) {
    return prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        lastUsedIp: true,
        revokedAt: true,
        createdAt: true
      }
    });
  }

  createWithinLimit(input: {
    workspaceId: string;
    createdById: string;
    name: string;
    keyId: string;
    secretHash: string;
    prefix: string;
    scopes: string[];
    expiresAt: Date | null;
  }) {
    return prisma.$transaction(async tx => {
      await lockWorkspaceQuota(tx, input.workspaceId);

      const activeKeys = await tx.apiKey.count({
        where: {
          workspaceId: input.workspaceId,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      });

      await assertCountAllowedInTransaction(tx, {
        workspaceId: input.workspaceId,
        metric: "API_KEYS",
        current: BigInt(activeKeys)
      });

      const created = await tx.apiKey.create({ data: input });

      await recordUsageInTransaction(tx, {
        workspaceId: input.workspaceId,
        metric: "API_KEYS",
        quantity: 1n,
        idempotencyKey: `api-key:${created.id}:created`,
        sourceType: "API_KEY",
        sourceId: created.id
      });

      return created;
    });
  }

  revoke(workspaceId: string, apiKeyId: string) {
    return prisma.$transaction(async tx => {
      const record = await tx.apiKey.findFirst({
        where: {
          id: apiKeyId,
          workspaceId,
          revokedAt: null
        },
        select: { id: true }
      });

      if (!record) return { count: 0 };

      await tx.apiKey.update({
        where: { id: record.id },
        data: { revokedAt: new Date() }
      });

      await recordUsageInTransaction(tx, {
        workspaceId,
        metric: "API_KEYS",
        quantity: -1n,
        idempotencyKey: `api-key:${record.id}:revoked`,
        sourceType: "API_KEY",
        sourceId: record.id
      });

      return { count: 1 };
    });
  }
}
