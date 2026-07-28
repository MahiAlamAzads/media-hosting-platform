import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./public-media.legacy.js";
import type { PublicMediaHttpService } from "./public-media.facade.service.js";
export class PublicMediaHttpController extends LegacyModuleController { constructor(service:PublicMediaHttpService) { super(service,implementation); } }
