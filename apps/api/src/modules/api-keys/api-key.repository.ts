import { prisma } from "@media/database";

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

  create(input: {
    workspaceId: string;
    createdById: string;
    name: string;
    keyId: string;
    secretHash: string;
    prefix: string;
    scopes: string[];
    expiresAt: Date | null;
  }) {
    return prisma.apiKey.create({ data: input });
  }

  revoke(workspaceId: string, apiKeyId: string) {
    return prisma.apiKey.updateMany({
      where: {
        id: apiKeyId,
        workspaceId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }
}
