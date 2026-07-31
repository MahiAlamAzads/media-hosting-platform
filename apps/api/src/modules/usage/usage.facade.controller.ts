import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./usage.legacy.js";
import type { UsageHttpService } from "./usage.facade.service.js";
export class UsageHttpController extends LegacyModuleController {
  constructor(service: UsageHttpService) {
    super(service, implementation);
  }
}
