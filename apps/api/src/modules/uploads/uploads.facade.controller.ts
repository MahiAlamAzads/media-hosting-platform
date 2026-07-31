import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./uploads.legacy.js";
import type { UploadsHttpService } from "./uploads.facade.service.js";
export class UploadsHttpController extends LegacyModuleController {
  constructor(service: UploadsHttpService) {
    super(service, implementation);
  }
}
