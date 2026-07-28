import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { PaymentCallbackHttpRepository } from "./payment-callback.facade.repository.js";
import type { PaymentCallbackHttpValidation } from "./payment-callback.facade.validation.js";
export class PaymentCallbackHttpService extends LegacyModuleService { constructor(repository:PaymentCallbackHttpRepository, validation:PaymentCallbackHttpValidation) { super(repository,validation); } }
