import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AdminConsoleHttpRepository } from "./admin-console.facade.repository.js";
import type { AdminConsoleHttpValidation } from "./admin-console.facade.validation.js";
export class AdminConsoleHttpService extends LegacyModuleService { constructor(repository:AdminConsoleHttpRepository, validation:AdminConsoleHttpValidation) { super(repository,validation); } }
