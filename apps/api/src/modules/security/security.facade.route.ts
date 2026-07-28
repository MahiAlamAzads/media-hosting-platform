import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { SecurityHttpController } from "./security.facade.controller.js";
export class SecurityHttpRoute extends LegacyModuleRoute { constructor(controller:SecurityHttpController) { super(controller); } }
