import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./payment-callback.legacy.js";
import type { PaymentCallbackHttpService } from "./payment-callback.facade.service.js";
export class PaymentCallbackHttpController extends LegacyModuleController { constructor(service:PaymentCallbackHttpService) { super(service,implementation); } }
