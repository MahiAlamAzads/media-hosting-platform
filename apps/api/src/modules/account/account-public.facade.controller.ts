import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./account-public.legacy.js";
import type { AccountPublicHttpService } from "./account-public.facade.service.js";
export class AccountPublicHttpController extends LegacyModuleController {
  constructor(service: AccountPublicHttpService) {
    super(service, implementation);
  }
}
