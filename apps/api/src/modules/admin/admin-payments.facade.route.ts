import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AdminPaymentsHttpController } from "./admin-payments.facade.controller.js";
export class AdminPaymentsHttpRoute extends LegacyModuleRoute { constructor(controller:AdminPaymentsHttpController) { super(controller); } }
