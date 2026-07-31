import path from "node:path";
import type { Request, Response } from "express";
import type { DeliveryService } from "./delivery.service.js";
import { createStorageReadStream } from "../../infrastructure/storage.js";
import { recordUsage } from "../billing/usage.service.js";
import { assertMeteredUsageAllowed } from "../billing/quota.service.js";

function contentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string {
  const basename = path.basename(filename);
  const safeAscii = basename.replace(/[^\x20-\x7E]+/g, "_");
  const encoded = encodeURIComponent(basename);

  return `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  stream = async (req: Request, res: Response): Promise<void> => {
    const token = Array.isArray(req.params.token)
      ? req.params.token[0]
      : req.params.token;

    const descriptor = await this.service.authorizeDelivery({
      token: token ?? "",
      rangeHeader: req.get("range"),
    });

    await assertMeteredUsageAllowed(
      descriptor.asset.workspaceId,
      "DELIVERY_BYTES",
      BigInt(descriptor.contentLength),
      `delivery:${req.id}`,
    );

    const contentType =
      descriptor.asset.detectedContentType ?? descriptor.asset.contentType;

    res.status(descriptor.statusCode);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(descriptor.contentLength));
    res.setHeader(
      "Content-Disposition",
      contentDisposition(
        descriptor.disposition,
        descriptor.asset.originalFilename,
      ),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    if (descriptor.contentRange) {
      res.setHeader("Content-Range", descriptor.contentRange);
    }

    res.once("finish", () => {
      void recordUsage({
        workspaceId: descriptor.asset.workspaceId,
        metric: "DELIVERY_BYTES",
        quantity: BigInt(descriptor.contentLength),
        idempotencyKey: `delivery:${req.id}`,
        paygOperationKey: `delivery:${req.id}`,
        sourceType: "SIGNED_DELIVERY",
        sourceId: descriptor.asset.id,
        metadata: {
          statusCode: descriptor.statusCode,
          range: descriptor.contentRange ?? null,
          disposition: descriptor.disposition,
        },
      }).catch((error) => {
        req.log.error({ err: error }, "failed to record delivery usage");
      });
    });

    const stream = createStorageReadStream(
      descriptor.asset.storageKey,
      descriptor.range ?? undefined,
    );

    stream.on("error", (error) => {
      req.log.error({ err: error }, "delivery stream failed");

      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(error);
      }
    });

    stream.pipe(res);
  };
}
