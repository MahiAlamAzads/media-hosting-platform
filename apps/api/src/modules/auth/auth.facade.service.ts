import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AuthHttpRepository } from "./auth.facade.repository.js";
import type { AuthHttpValidation } from "./auth.facade.validation.js";
export class AuthHttpService extends LegacyModuleService { constructor(repository:AuthHttpRepository, validation:AuthHttpValidation) { super(repository,validation); } }
