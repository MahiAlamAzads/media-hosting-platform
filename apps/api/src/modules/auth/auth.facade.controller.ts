import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./auth.legacy.js";
import type { AuthHttpService } from "./auth.facade.service.js";
export class AuthHttpController extends LegacyModuleController {
  constructor(service: AuthHttpService) {
    super(service, implementation);
  }
}
