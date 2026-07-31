import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { SecurityHttpController } from "./security.facade.controller.js";
import { SecurityHttpRepository } from "./security.facade.repository.js";
import { SecurityHttpRoute } from "./security.facade.route.js";
import { SecurityHttpService } from "./security.facade.service.js";
import { SecurityHttpValidation } from "./security.facade.validation.js";
const repository = new SecurityHttpRepository();
const validation = new SecurityHttpValidation();
const service = new SecurityHttpService(repository, validation);
const controller = new SecurityHttpController(service);
const route = new SecurityHttpRoute(controller);
export const securityModule: ApiModuleDescriptor = {
  name: "security",
  mountPath: "/api/v1/security",
  router: route.router,
};
