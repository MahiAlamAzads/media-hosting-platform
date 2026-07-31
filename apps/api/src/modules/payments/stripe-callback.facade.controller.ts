import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./stripe-callback.legacy.js";
import type { StripeCallbackHttpService } from "./stripe-callback.facade.service.js";
export class StripeCallbackHttpController extends LegacyModuleController {
  constructor(service: StripeCallbackHttpService) {
    super(service, implementation);
  }
}
