import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AuditHttpController } from "./audit.facade.controller.js";
export class AuditHttpRoute extends LegacyModuleRoute {
  constructor(controller: AuditHttpController) {
    super(controller);
  }
}
