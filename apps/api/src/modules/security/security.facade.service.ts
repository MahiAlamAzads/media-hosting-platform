import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { SecurityHttpRepository } from "./security.facade.repository.js";
import type { SecurityHttpValidation } from "./security.facade.validation.js";
export class SecurityHttpService extends LegacyModuleService {
  constructor(
    repository: SecurityHttpRepository,
    validation: SecurityHttpValidation,
  ) {
    super(repository, validation);
  }
}
