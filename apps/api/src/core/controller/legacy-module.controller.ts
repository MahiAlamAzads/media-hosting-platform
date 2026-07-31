import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from "express";
import type { LegacyModuleService } from "../service/legacy-module.service.js";
export class LegacyModuleController {
  constructor(
    private readonly service: LegacyModuleService,
    private readonly implementation: Router,
  ) {}
  readonly handle: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    this.service.assertReady();
    this.implementation(req, res, next);
  };
}
