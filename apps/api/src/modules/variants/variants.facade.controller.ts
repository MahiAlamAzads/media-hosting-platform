import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./variants.legacy.js";
import type { VariantsHttpService } from "./variants.facade.service.js";
export class VariantsHttpController extends LegacyModuleController {
  constructor(service: VariantsHttpService) {
    super(service, implementation);
  }
}
