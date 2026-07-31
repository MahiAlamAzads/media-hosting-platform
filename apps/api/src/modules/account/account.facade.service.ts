import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AccountHttpRepository } from "./account.facade.repository.js";
import type { AccountHttpValidation } from "./account.facade.validation.js";
export class AccountHttpService extends LegacyModuleService {
  constructor(
    repository: AccountHttpRepository,
    validation: AccountHttpValidation,
  ) {
    super(repository, validation);
  }
}
