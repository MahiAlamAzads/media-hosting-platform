import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { VariantsHttpRepository } from "./variants.facade.repository.js";
import type { VariantsHttpValidation } from "./variants.facade.validation.js";
export class VariantsHttpService extends LegacyModuleService {
  constructor(
    repository: VariantsHttpRepository,
    validation: VariantsHttpValidation,
  ) {
    super(repository, validation);
  }
}
