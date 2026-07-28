import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AdminPlansHttpRepository } from "./admin-plans.facade.repository.js";
import type { AdminPlansHttpValidation } from "./admin-plans.facade.validation.js";
export class AdminPlansHttpService extends LegacyModuleService { constructor(repository:AdminPlansHttpRepository, validation:AdminPlansHttpValidation) { super(repository,validation); } }
