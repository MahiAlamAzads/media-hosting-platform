import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./security.legacy.js";
import type { SecurityHttpService } from "./security.facade.service.js";
export class SecurityHttpController extends LegacyModuleController { constructor(service:SecurityHttpService) { super(service,implementation); } }
