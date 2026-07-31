import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AccountPublicHttpController } from "./account-public.facade.controller.js";
export class AccountPublicHttpRoute extends LegacyModuleRoute {
  constructor(controller: AccountPublicHttpController) {
    super(controller);
  }
}
