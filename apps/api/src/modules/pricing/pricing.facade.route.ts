import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { PricingHttpController } from "./pricing.facade.controller.js";
export class PricingHttpRoute extends LegacyModuleRoute {
  constructor(controller: PricingHttpController) {
    super(controller);
  }
}
