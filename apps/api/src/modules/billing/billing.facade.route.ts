import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { BillingHttpController } from "./billing.facade.controller.js";
export class BillingHttpRoute extends LegacyModuleRoute { constructor(controller:BillingHttpController) { super(controller); } }
