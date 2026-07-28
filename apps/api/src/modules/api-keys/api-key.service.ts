import { z } from "zod";
import {
  API_KEY_SCOPES,
  createApiKeyMaterial
} from "../../shared/api-key.js";
import { AppError } from "../../shared/http.js";
import { ApiKeyRepository } from "./api-key.repository.js";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  expiresAt: z.coerce.date().nullable().optional()
});

export class ApiKeyService {
  constructor(private readonly repository: ApiKeyRepository) {}

  list(workspaceId: string) {
    return this.repository.list(workspaceId);
  }

  async create(input: {
    workspaceId: string;
    userId: string;
    body: unknown;
  }) {
    const parsed = createSchema.parse(input.body);
    const material = createApiKeyMaterial();

    const record = await this.repository.createWithinLimit({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: parsed.name,
      keyId: material.keyId,
      secretHash: material.secretHash,
      prefix: material.prefix,
      scopes: parsed.scopes,
      expiresAt: parsed.expiresAt ?? null
    });

    return {
      id: record.id,
      name: record.name,
      rawKey: material.rawKey,
      prefix: record.prefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt
    };
  }

  async revoke(workspaceId: string, apiKeyId: string) {
    const result = await this.repository.revoke(workspaceId, apiKeyId);

    if (result.count !== 1) {
      throw new AppError(404, "API_KEY_NOT_FOUND", "API key was not found.");
    }
  }
}
