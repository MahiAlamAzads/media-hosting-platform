import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import { AuditHttpController } from "./audit.facade.controller.js";
import { AuditHttpRepository } from "./audit.facade.repository.js";
import { AuditHttpRoute } from "./audit.facade.route.js";
import { AuditHttpService } from "./audit.facade.service.js";
import { AuditHttpValidation } from "./audit.facade.validation.js";
const repository = new AuditHttpRepository();
const validation = new AuditHttpValidation();
const service = new AuditHttpService(repository, validation);
const controller = new AuditHttpController(service);
const route = new AuditHttpRoute(controller);
export const auditModule: ApiModuleDescriptor = {
  name: "audit",
  mountPath: "/api/v1/audit-logs",
  router: route.router,
};
