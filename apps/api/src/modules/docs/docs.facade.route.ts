import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { DocsHttpController } from "./docs.facade.controller.js";
export class DocsHttpRoute extends LegacyModuleRoute {
  constructor(controller: DocsHttpController) {
    super(controller);
  }
}
