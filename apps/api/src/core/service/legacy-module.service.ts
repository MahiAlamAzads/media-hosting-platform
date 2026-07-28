import type { LegacyModuleRepository } from "../repository/legacy-module.repository.js";
import type { LegacyModuleValidation } from "../validation/legacy-module.validation.js";
export class LegacyModuleService { constructor(readonly repository: LegacyModuleRepository, readonly validation: LegacyModuleValidation) {} assertReady(): void { void this.repository; void this.validation; } }
