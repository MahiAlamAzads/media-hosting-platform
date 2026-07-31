import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { PaygHttpRepository } from "./payg.facade.repository.js";
import type { PaygHttpValidation } from "./payg.facade.validation.js";
export class PaygHttpService extends LegacyModuleService {
  constructor(repository: PaygHttpRepository, validation: PaygHttpValidation) {
    super(repository, validation);
  }
}
