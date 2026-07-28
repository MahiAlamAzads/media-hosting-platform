import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./admin-payments.legacy.js";
import type { AdminPaymentsHttpService } from "./admin-payments.facade.service.js";
export class AdminPaymentsHttpController extends LegacyModuleController { constructor(service:AdminPaymentsHttpService) { super(service,implementation); } }
