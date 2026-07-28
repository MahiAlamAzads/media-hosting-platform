import { LegacyModuleRoute } from "../../core/route/legacy-module.route.js";
import type { FoldersHttpController } from "./folders.facade.controller.js";
export class FoldersHttpRoute extends LegacyModuleRoute { constructor(controller:FoldersHttpController) { super(controller); } }
