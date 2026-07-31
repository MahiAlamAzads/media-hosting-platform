import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { UploadsHttpController } from "./uploads.facade.controller.js";
import { UploadsHttpRepository } from "./uploads.facade.repository.js";
import { UploadsHttpRoute } from "./uploads.facade.route.js";
import { UploadsHttpService } from "./uploads.facade.service.js";
import { UploadsHttpValidation } from "./uploads.facade.validation.js";
const repository = new UploadsHttpRepository();
const validation = new UploadsHttpValidation();
const service = new UploadsHttpService(repository, validation);
const controller = new UploadsHttpController(service);
const route = new UploadsHttpRoute(controller);
export const uploadsModule: ApiModuleDescriptor = {
  name: "uploads",
  mountPath: "/api/v1/uploads",
  router: route.router,
};
