import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { DocsHttpRepository } from "./docs.facade.repository.js";
import type { DocsHttpValidation } from "./docs.facade.validation.js";
export class DocsHttpService extends LegacyModuleService { constructor(repository:DocsHttpRepository, validation:DocsHttpValidation) { super(repository,validation); } }
