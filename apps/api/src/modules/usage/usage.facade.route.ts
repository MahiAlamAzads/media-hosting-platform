import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { UsageHttpController } from "./usage.facade.controller.js";
export class UsageHttpRoute extends LegacyModuleRoute { constructor(controller:UsageHttpController) { super(controller); } }
