import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { AuditHttpRepository } from "./audit.facade.repository.js";
import type { AuditHttpValidation } from "./audit.facade.validation.js";
export class AuditHttpService extends LegacyModuleService { constructor(repository:AuditHttpRepository, validation:AuditHttpValidation) { super(repository,validation); } }
