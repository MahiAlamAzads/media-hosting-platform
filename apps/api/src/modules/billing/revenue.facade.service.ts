import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { RevenueHttpRepository } from "./revenue.facade.repository.js";
import type { RevenueHttpValidation } from "./revenue.facade.validation.js";
export class RevenueHttpService extends LegacyModuleService { constructor(repository:RevenueHttpRepository, validation:RevenueHttpValidation) { super(repository,validation); } }
