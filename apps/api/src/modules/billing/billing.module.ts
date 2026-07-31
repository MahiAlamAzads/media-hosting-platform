import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { BillingHttpController } from "./billing.facade.controller.js";
import { BillingHttpRepository } from "./billing.facade.repository.js";
import { BillingHttpRoute } from "./billing.facade.route.js";
import { BillingHttpService } from "./billing.facade.service.js";
import { BillingHttpValidation } from "./billing.facade.validation.js";
const repository = new BillingHttpRepository();
const validation = new BillingHttpValidation();
const service = new BillingHttpService(repository, validation);
const controller = new BillingHttpController(service);
const route = new BillingHttpRoute(controller);
export const billingModule: ApiModuleDescriptor = {
  name: "billing",
  mountPath: "/api/v1/billing",
  router: route.router,
};
