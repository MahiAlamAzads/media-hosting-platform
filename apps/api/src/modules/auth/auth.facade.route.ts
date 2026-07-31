import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AuthHttpController } from "./auth.facade.controller.js";
export class AuthHttpRoute extends LegacyModuleRoute {
  constructor(controller: AuthHttpController) {
    super(controller);
  }
}
