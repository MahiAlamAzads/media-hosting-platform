import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { UploadsHttpRepository } from "./uploads.facade.repository.js";
import type { UploadsHttpValidation } from "./uploads.facade.validation.js";
export class UploadsHttpService extends LegacyModuleService {
  constructor(
    repository: UploadsHttpRepository,
    validation: UploadsHttpValidation,
  ) {
    super(repository, validation);
  }
}
