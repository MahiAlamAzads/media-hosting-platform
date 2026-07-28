import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { MediaHttpRepository } from "./media.facade.repository.js";
import type { MediaHttpValidation } from "./media.facade.validation.js";
export class MediaHttpService extends LegacyModuleService { constructor(repository:MediaHttpRepository, validation:MediaHttpValidation) { super(repository,validation); } }
