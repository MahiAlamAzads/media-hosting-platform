import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AdminConsoleHttpController } from "./admin-console.facade.controller.js";
export class AdminConsoleHttpRoute extends LegacyModuleRoute { constructor(controller:AdminConsoleHttpController) { super(controller); } }
