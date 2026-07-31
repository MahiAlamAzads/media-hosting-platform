import { describe, expect, it, vi } from "vitest";
import { ApiKeyService } from "../../../../src/modules/api-keys/api-key.service.js";

describe("ApiKeyService", () => {
  it("returns the raw key only from creation", async () => {
    const repository = {
      list: vi.fn(),
      createWithinLimit: vi.fn().mockImplementation(async (input) => ({
        id: "ckey123456789012345678901",
        ...input,
        createdAt: new Date("2026-07-27T00:00:00.000Z"),
      })),
      revoke: vi.fn(),
    };

    const service = new ApiKeyService(repository as never);

    const result = await service.create({
      workspaceId: "workspace-1",
      userId: "user-1",
      body: {
        name: "Production uploader",
        scopes: ["uploads:write", "media:read"],
      },
    });

    expect(result.rawKey).toMatch(/^mh_live_/);
    expect(result.scopes).toEqual(["uploads:write", "media:read"]);
    expect(repository.createWithinLimit).toHaveBeenCalledOnce();
  });

  it("rejects unsupported scopes", async () => {
    const repository = {
      list: vi.fn(),
      createWithinLimit: vi.fn(),
      revoke: vi.fn(),
    };

    const service = new ApiKeyService(repository as never);

    await expect(
      service.create({
        workspaceId: "workspace-1",
        userId: "user-1",
        body: {
          name: "Bad key",
          scopes: ["admin:everything"],
        },
      }),
    ).rejects.toBeDefined();
  });
});
