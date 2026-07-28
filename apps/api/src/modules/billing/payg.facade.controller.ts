import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./payg.legacy.js";
import type { PaygHttpService } from "./payg.facade.service.js";
export class PaygHttpController extends LegacyModuleController { constructor(service:PaygHttpService) { super(service,implementation); } }
