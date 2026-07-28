import type { NextFunction, Request, Response } from "express";
import { recordUsage } from "../modules/billing/usage.service.js";

export function meterAuthenticatedApiRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.once("finish", () => {
    if (
      !req.auth ||
      !req.originalUrl.startsWith("/api/v1/") ||
      req.originalUrl.startsWith("/api/v1/docs")
    ) {
      return;
    }

    void recordUsage({
      workspaceId: req.auth.workspaceId,
      metric: "API_REQUESTS",
      quantity: 1n,
      idempotencyKey: `api:${req.id}`,
      paygOperationKey: `api:${req.id}`,
      sourceType: "API_REQUEST",
      sourceId: String(req.id),
      metadata: {
        method: req.method,
        path: req.originalUrl.split("?")[0],
        statusCode: res.statusCode,
        principalType: req.auth.principalType,
        apiKeyId: req.auth.apiKeyId ?? null
      }
    }).catch(error => {
      req.log.error(
        { err: error },
        "failed to record API request usage"
      );
    });
  });

  next();
}
