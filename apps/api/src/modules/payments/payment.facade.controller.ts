import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./payment.legacy.js";
import type { PaymentHttpService } from "./payment.facade.service.js";
export class PaymentHttpController extends LegacyModuleController {
  constructor(service: PaymentHttpService) {
    super(service, implementation);
  }
}
