import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./admin-console.legacy.js";
import type { AdminConsoleHttpService } from "./admin-console.facade.service.js";
export class AdminConsoleHttpController extends LegacyModuleController {
  constructor(service: AdminConsoleHttpService) {
    super(service, implementation);
  }
}
