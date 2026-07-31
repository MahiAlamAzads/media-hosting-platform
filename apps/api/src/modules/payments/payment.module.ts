import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { PaymentHttpController } from "./payment.facade.controller.js";
import { PaymentHttpRepository } from "./payment.facade.repository.js";
import { PaymentHttpRoute } from "./payment.facade.route.js";
import { PaymentHttpService } from "./payment.facade.service.js";
import { PaymentHttpValidation } from "./payment.facade.validation.js";
const repository = new PaymentHttpRepository();
const validation = new PaymentHttpValidation();
const service = new PaymentHttpService(repository, validation);
const controller = new PaymentHttpController(service);
const route = new PaymentHttpRoute(controller);
export const paymentModule: ApiModuleDescriptor = {
  name: "payment",
  mountPath: "/api/v1/payments",
  router: route.router,
};
