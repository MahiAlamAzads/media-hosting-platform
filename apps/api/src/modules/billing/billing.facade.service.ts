import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { BillingHttpRepository } from "./billing.facade.repository.js";
import type { BillingHttpValidation } from "./billing.facade.validation.js";
export class BillingHttpService extends LegacyModuleService { constructor(repository:BillingHttpRepository, validation:BillingHttpValidation) { super(repository,validation); } }
