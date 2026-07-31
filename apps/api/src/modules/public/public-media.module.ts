import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { PublicMediaHttpController } from "./public-media.facade.controller.js";
import { PublicMediaHttpRepository } from "./public-media.facade.repository.js";
import { PublicMediaHttpRoute } from "./public-media.facade.route.js";
import { PublicMediaHttpService } from "./public-media.facade.service.js";
import { PublicMediaHttpValidation } from "./public-media.facade.validation.js";
const repository = new PublicMediaHttpRepository();
const validation = new PublicMediaHttpValidation();
const service = new PublicMediaHttpService(repository, validation);
const controller = new PublicMediaHttpController(service);
const route = new PublicMediaHttpRoute(controller);
export const publicMediaModule: ApiModuleDescriptor = {
  name: "public-media",
  mountPath: "/i",
  router: route.router,
};
export const publicMediaCompatibilityModule: ApiModuleDescriptor = {
  name: "public-media",
  mountPath: "/api/v1/public",
  router: route.router,
};
