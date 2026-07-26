import { prisma } from "@media/database";
import type { DeliveryAsset } from "./delivery.types.js";

export interface DeliveryRepository {
  findReadyAsset(
    assetId: string,
    workspaceId: string
  ): Promise<DeliveryAsset | null>;
}

export class PrismaDeliveryRepository implements DeliveryRepository {
  async findReadyAsset(
    assetId: string,
    workspaceId: string
  ): Promise<DeliveryAsset | null> {
    return prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        workspaceId,
        status: "READY",
        deletedAt: null
      },
      select: {
        id: true,
        workspaceId: true,
        originalFilename: true,
        storageKey: true,
        contentType: true,
        detectedContentType: true
      }
    });
  }
}
