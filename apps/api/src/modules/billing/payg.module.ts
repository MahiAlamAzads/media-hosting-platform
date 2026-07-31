import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { PaygHttpController } from "./payg.facade.controller.js";
import { PaygHttpRepository } from "./payg.facade.repository.js";
import { PaygHttpRoute } from "./payg.facade.route.js";
import { PaygHttpService } from "./payg.facade.service.js";
import { PaygHttpValidation } from "./payg.facade.validation.js";
const repository = new PaygHttpRepository();
const validation = new PaygHttpValidation();
const service = new PaygHttpService(repository, validation);
const controller = new PaygHttpController(service);
const route = new PaygHttpRoute(controller);
export const paygModule: ApiModuleDescriptor = {
  name: "payg",
  mountPath: "/api/v1/billing",
  router: route.router,
};
