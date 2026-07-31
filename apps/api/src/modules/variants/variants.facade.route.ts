import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { VariantsHttpController } from "./variants.facade.controller.js";
export class VariantsHttpRoute extends LegacyModuleRoute {
  constructor(controller: VariantsHttpController) {
    super(controller);
  }
}
