import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./audit.legacy.js";
import type { AuditHttpService } from "./audit.facade.service.js";
export class AuditHttpController extends LegacyModuleController { constructor(service:AuditHttpService) { super(service,implementation); } }
