import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AdminPlansHttpController } from "./admin-plans.facade.controller.js";
export class AdminPlansHttpRoute extends LegacyModuleRoute { constructor(controller:AdminPlansHttpController) { super(controller); } }
