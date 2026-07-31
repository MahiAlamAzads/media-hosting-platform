import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { AccountHttpController } from "./account.facade.controller.js";
export class AccountHttpRoute extends LegacyModuleRoute {
  constructor(controller: AccountHttpController) {
    super(controller);
  }
}
