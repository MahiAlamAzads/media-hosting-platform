import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type DeliveryClaims = {
  sub: string;
  workspaceId: string;
  assetId: string;
  disposition: "inline" | "attachment";
  type: "media-delivery";
};

export function createDeliveryToken(input: {
  userId: string;
  workspaceId: string;
  assetId: string;
  disposition: "inline" | "attachment";
}): string {
  return jwt.sign(
    {
      workspaceId: input.workspaceId,
      assetId: input.assetId,
      disposition: input.disposition,
      type: "media-delivery",
    },
    env.MEDIA_SIGNING_SECRET,
    {
      subject: input.userId,
      issuer: "media-platform",
      audience: "media-delivery",
      expiresIn: env.DELIVERY_TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyDeliveryToken(token: string): DeliveryClaims {
  return jwt.verify(token, env.MEDIA_SIGNING_SECRET, {
    issuer: "media-platform",
    audience: "media-delivery",
  }) as DeliveryClaims;
}
