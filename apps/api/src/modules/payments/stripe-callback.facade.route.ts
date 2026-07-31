import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { StripeCallbackHttpController } from "./stripe-callback.facade.controller.js";
export class StripeCallbackHttpRoute extends LegacyModuleRoute {
  constructor(controller: StripeCallbackHttpController) {
    super(controller);
  }
}
