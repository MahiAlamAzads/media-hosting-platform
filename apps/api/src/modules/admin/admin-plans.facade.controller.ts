import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./admin-plans.legacy.js";
import type { AdminPlansHttpService } from "./admin-plans.facade.service.js";
export class AdminPlansHttpController extends LegacyModuleController {
  constructor(service: AdminPlansHttpService) {
    super(service, implementation);
  }
}
