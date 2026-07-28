import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { UsageHttpRepository } from "./usage.facade.repository.js";
import type { UsageHttpValidation } from "./usage.facade.validation.js";
export class UsageHttpService extends LegacyModuleService { constructor(repository:UsageHttpRepository, validation:UsageHttpValidation) { super(repository,validation); } }
