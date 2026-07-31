import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./media.legacy.js";
import type { MediaHttpService } from "./media.facade.service.js";
export class MediaHttpController extends LegacyModuleController {
  constructor(service: MediaHttpService) {
    super(service, implementation);
  }
}
