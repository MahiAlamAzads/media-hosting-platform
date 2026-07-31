import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { FoldersHttpRepository } from "./folders.facade.repository.js";
import type { FoldersHttpValidation } from "./folders.facade.validation.js";
export class FoldersHttpService extends LegacyModuleService {
  constructor(
    repository: FoldersHttpRepository,
    validation: FoldersHttpValidation,
  ) {
    super(repository, validation);
  }
}
