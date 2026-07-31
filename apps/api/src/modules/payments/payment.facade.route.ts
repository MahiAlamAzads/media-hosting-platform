import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { PaymentHttpController } from "./payment.facade.controller.js";
export class PaymentHttpRoute extends LegacyModuleRoute {
  constructor(controller: PaymentHttpController) {
    super(controller);
  }
}
