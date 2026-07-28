import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { UploadsHttpController } from "./uploads.facade.controller.js";
export class UploadsHttpRoute extends LegacyModuleRoute { constructor(controller:UploadsHttpController) { super(controller); } }
