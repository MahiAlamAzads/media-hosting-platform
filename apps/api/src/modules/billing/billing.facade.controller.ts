import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./billing.legacy.js";
import type { BillingHttpService } from "./billing.facade.service.js";
export class BillingHttpController extends LegacyModuleController { constructor(service:BillingHttpService) { super(service,implementation); } }
