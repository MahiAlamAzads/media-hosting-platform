import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { PublicMediaHttpController } from "./public-media.facade.controller.js";
export class PublicMediaHttpRoute extends LegacyModuleRoute { constructor(controller:PublicMediaHttpController) { super(controller); } }
