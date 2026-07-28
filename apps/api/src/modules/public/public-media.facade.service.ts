import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { PublicMediaHttpRepository } from "./public-media.facade.repository.js";
import type { PublicMediaHttpValidation } from "./public-media.facade.validation.js";
export class PublicMediaHttpService extends LegacyModuleService { constructor(repository:PublicMediaHttpRepository, validation:PublicMediaHttpValidation) { super(repository,validation); } }
