import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { PaygHttpController } from "./payg.facade.controller.js";
export class PaygHttpRoute extends LegacyModuleRoute {
  constructor(controller: PaygHttpController) {
    super(controller);
  }
}
