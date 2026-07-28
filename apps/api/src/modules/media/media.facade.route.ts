import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { MediaHttpController } from "./media.facade.controller.js";
export class MediaHttpRoute extends LegacyModuleRoute { constructor(controller:MediaHttpController) { super(controller); } }
