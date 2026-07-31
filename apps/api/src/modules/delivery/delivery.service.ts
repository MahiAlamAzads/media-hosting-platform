import { AppError } from "../../shared/http.js";
import { verifyDeliveryToken } from "../../shared/delivery-token.js";
import type { DeliveryRepository } from "./delivery.repository.js";
import type {
  DeliveryDescriptor,
  DeliveryDisposition,
} from "./delivery.types.js";
import { parseByteRange } from "./range-parser.js";

export interface DeliveryStorage {
  fileSize(storageKey: string): Promise<bigint>;
}

export class DeliveryService {
  constructor(
    private readonly repository: DeliveryRepository,
    private readonly storage: DeliveryStorage,
  ) {}

  async authorizeDelivery(input: {
    token: string;
    rangeHeader?: string;
  }): Promise<DeliveryDescriptor> {
    let claims;

    try {
      claims = verifyDeliveryToken(input.token);
    } catch {
      throw new AppError(
        401,
        "INVALID_DELIVERY_TOKEN",
        "Delivery token is invalid or expired.",
      );
    }

    if (claims.type !== "media-delivery") {
      throw new AppError(
        401,
        "INVALID_DELIVERY_TOKEN",
        "Delivery token type is invalid.",
      );
    }

    const asset = await this.repository.findReadyAsset(
      claims.assetId,
      claims.workspaceId,
    );

    if (!asset) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Media asset was not found.");
    }

    const fileSizeBigInt = await this.storage.fileSize(asset.storageKey);

    if (fileSizeBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AppError(
        413,
        "MEDIA_TOO_LARGE",
        "Media file is too large for this delivery path.",
      );
    }

    const fileSize = Number(fileSizeBigInt);
    const range = parseByteRange(input.rangeHeader, fileSize);

    if (input.rangeHeader && !range) {
      throw new AppError(
        416,
        "INVALID_RANGE",
        "Requested byte range is invalid.",
      );
    }

    return {
      asset,
      fileSize,
      range,
      statusCode: range ? 206 : 200,
      contentLength: range ? range.end - range.start + 1 : fileSize,
      contentRange: range
        ? `bytes ${range.start}-${range.end}/${fileSize}`
        : undefined,
      disposition: claims.disposition as DeliveryDisposition,
    };
  }
}
