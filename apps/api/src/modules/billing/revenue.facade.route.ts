import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { RevenueHttpController } from "./revenue.facade.controller.js";
export class RevenueHttpRoute extends LegacyModuleRoute { constructor(controller:RevenueHttpController) { super(controller); } }
