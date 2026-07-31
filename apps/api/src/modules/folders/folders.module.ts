import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { FoldersHttpController } from "./folders.facade.controller.js";
import { FoldersHttpRepository } from "./folders.facade.repository.js";
import { FoldersHttpRoute } from "./folders.facade.route.js";
import { FoldersHttpService } from "./folders.facade.service.js";
import { FoldersHttpValidation } from "./folders.facade.validation.js";
const repository = new FoldersHttpRepository();
const validation = new FoldersHttpValidation();
const service = new FoldersHttpService(repository, validation);
const controller = new FoldersHttpController(service);
const route = new FoldersHttpRoute(controller);
export const foldersModule: ApiModuleDescriptor = {
  name: "folders",
  mountPath: "/api/v1/folders",
  router: route.router,
};
