import { beforeEach, describe, expect, it, vi } from "vitest";
import * as deliveryToken from "../../../../src/shared/delivery-token.js";
import type { DeliveryRepository } from "../../../../src/modules/delivery/delivery.repository.js";
import { DeliveryService, type DeliveryStorage } from "../../../../src/modules/delivery/delivery.service.js";

describe("DeliveryService", () => {
  const repository: DeliveryRepository = {
    findReadyAsset: vi.fn()
  };

  const storage: DeliveryStorage = {
    fileSize: vi.fn()
  };

  const service = new DeliveryService(repository, storage);

  beforeEach(() => {
    vi.spyOn(deliveryToken, "verifyDeliveryToken").mockReturnValue({
      sub: "user-1",
      workspaceId: "workspace-1",
      assetId: "asset-1",
      disposition: "inline",
      type: "media-delivery"
    });
  });

  it("returns a full-file delivery descriptor", async () => {
    vi.mocked(repository.findReadyAsset).mockResolvedValue({
      id: "asset-1",
      workspaceId: "workspace-1",
      originalFilename: "video.mp4",
      storageKey: "tenants/workspace-1/video.mp4",
      contentType: "video/mp4",
      detectedContentType: "video/mp4"
    });

    vi.mocked(storage.fileSize).mockResolvedValue(1000n);

    await expect(
      service.authorizeDelivery({ token: "valid-token" })
    ).resolves.toMatchObject({
      fileSize: 1000,
      statusCode: 200,
      contentLength: 1000,
      range: null
    });
  });

  it("returns a partial-content descriptor", async () => {
    vi.mocked(repository.findReadyAsset).mockResolvedValue({
      id: "asset-1",
      workspaceId: "workspace-1",
      originalFilename: "video.mp4",
      storageKey: "tenants/workspace-1/video.mp4",
      contentType: "video/mp4",
      detectedContentType: "video/mp4"
    });

    vi.mocked(storage.fileSize).mockResolvedValue(1000n);

    await expect(
      service.authorizeDelivery({
        token: "valid-token",
        rangeHeader: "bytes=100-199"
      })
    ).resolves.toMatchObject({
      statusCode: 206,
      contentLength: 100,
      contentRange: "bytes 100-199/1000"
    });
  });

  it("rejects an invalid token", async () => {
    vi.spyOn(deliveryToken, "verifyDeliveryToken").mockImplementation(() => {
      throw new Error("invalid");
    });

    await expect(
      service.authorizeDelivery({ token: "invalid-token" })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_DELIVERY_TOKEN"
    });
  });

  it("rejects a missing asset", async () => {
    vi.mocked(repository.findReadyAsset).mockResolvedValue(null);

    await expect(
      service.authorizeDelivery({ token: "valid-token" })
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "MEDIA_NOT_FOUND"
    });
  });

  it("rejects an invalid byte range", async () => {
    vi.mocked(repository.findReadyAsset).mockResolvedValue({
      id: "asset-1",
      workspaceId: "workspace-1",
      originalFilename: "video.mp4",
      storageKey: "tenants/workspace-1/video.mp4",
      contentType: "video/mp4",
      detectedContentType: "video/mp4"
    });

    vi.mocked(storage.fileSize).mockResolvedValue(1000n);

    await expect(
      service.authorizeDelivery({
        token: "valid-token",
        rangeHeader: "bytes=2000-3000"
      })
    ).rejects.toMatchObject({
      statusCode: 416,
      code: "INVALID_RANGE"
    });
  });
});
