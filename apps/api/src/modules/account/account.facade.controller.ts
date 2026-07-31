import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./account.legacy.js";
import type { AccountHttpService } from "./account.facade.service.js";
export class AccountHttpController extends LegacyModuleController {
  constructor(service: AccountHttpService) {
    super(service, implementation);
  }
}
