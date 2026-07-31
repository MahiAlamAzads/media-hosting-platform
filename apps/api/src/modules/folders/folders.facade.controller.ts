import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./folders.legacy.js";
import type { FoldersHttpService } from "./folders.facade.service.js";
export class FoldersHttpController extends LegacyModuleController {
  constructor(service: FoldersHttpService) {
    super(service, implementation);
  }
}
