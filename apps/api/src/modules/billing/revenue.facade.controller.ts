import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./revenue.legacy.js";
import type { RevenueHttpService } from "./revenue.facade.service.js";
export class RevenueHttpController extends LegacyModuleController {
  constructor(service: RevenueHttpService) {
    super(service, implementation);
  }
}
