import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { PaymentCallbackHttpController } from "./payment-callback.facade.controller.js";
export class PaymentCallbackHttpRoute extends LegacyModuleRoute {
  constructor(controller: PaymentCallbackHttpController) {
    super(controller);
  }
}
