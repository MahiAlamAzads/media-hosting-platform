import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { MediaHttpController } from "./media.facade.controller.js";
import { MediaHttpRepository } from "./media.facade.repository.js";
import { MediaHttpRoute } from "./media.facade.route.js";
import { MediaHttpService } from "./media.facade.service.js";
import { MediaHttpValidation } from "./media.facade.validation.js";
const repository = new MediaHttpRepository();
const validation = new MediaHttpValidation();
const service = new MediaHttpService(repository, validation);
const controller = new MediaHttpController(service);
const route = new MediaHttpRoute(controller);
export const mediaModule: ApiModuleDescriptor = {
  name: "media",
  mountPath: "/api/v1/media",
  router: route.router,
};
