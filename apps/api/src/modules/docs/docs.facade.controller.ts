import { LegacyModuleController } from "../../core/controller/legacy-module.controller.js";
import implementation from "./docs.legacy.js";
import type { DocsHttpService } from "./docs.facade.service.js";
export class DocsHttpController extends LegacyModuleController { constructor(service:DocsHttpService) { super(service,implementation); } }
