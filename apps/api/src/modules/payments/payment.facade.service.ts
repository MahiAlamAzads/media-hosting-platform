import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { PaymentHttpRepository } from "./payment.facade.repository.js";
import type { PaymentHttpValidation } from "./payment.facade.validation.js";
export class PaymentHttpService extends LegacyModuleService { constructor(repository:PaymentHttpRepository, validation:PaymentHttpValidation) { super(repository,validation); } }
