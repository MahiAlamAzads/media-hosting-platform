import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AccountPublicHttpRepository } from "./account-public.facade.repository.js";
import type { AccountPublicHttpValidation } from "./account-public.facade.validation.js";
export class AccountPublicHttpService extends LegacyModuleService { constructor(repository:AccountPublicHttpRepository, validation:AccountPublicHttpValidation) { super(repository,validation); } }
