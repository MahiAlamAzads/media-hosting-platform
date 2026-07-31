import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { PricingHttpRepository } from "./pricing.facade.repository.js";
import type { PricingHttpValidation } from "./pricing.facade.validation.js";
export class PricingHttpService extends LegacyModuleService {
  constructor(
    repository: PricingHttpRepository,
    validation: PricingHttpValidation,
  ) {
    super(repository, validation);
  }
}
