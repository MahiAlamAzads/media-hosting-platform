import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AdminPaymentsHttpRepository } from "./admin-payments.facade.repository.js";
import type { AdminPaymentsHttpValidation } from "./admin-payments.facade.validation.js";
export class AdminPaymentsHttpService extends LegacyModuleService {
  constructor(
    repository: AdminPaymentsHttpRepository,
    validation: AdminPaymentsHttpValidation,
  ) {
    super(repository, validation);
  }
}
