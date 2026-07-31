import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./pricing.legacy.js";
import type { PricingHttpService } from "./pricing.facade.service.js";
export class PricingHttpController extends LegacyModuleController {
  constructor(service: PricingHttpService) {
    super(service, implementation);
  }
}
