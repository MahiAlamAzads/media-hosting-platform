import type { Request, Response } from "express";
import { z } from "zod";
import { ApiKeyService } from "./api-key.service.js";

const routeIdSchema = z.string().cuid();

export class ApiKeyController {
  constructor(private readonly service: ApiKeyService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const items = await this.service.list(req.auth!.workspaceId);

    res.json({
      data: items,
      meta: { requestId: req.id },
    });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const item = await this.service.create({
      workspaceId: req.auth!.workspaceId,
      userId: req.auth!.userId,
      body: req.body,
    });

    res.status(201).json({
      data: item,
      meta: { requestId: req.id },
    });
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    const apiKeyId = routeIdSchema.parse(req.params.apiKeyId);

    await this.service.revoke(req.auth!.workspaceId, apiKeyId);

    res.status(204).send();
  };
}
