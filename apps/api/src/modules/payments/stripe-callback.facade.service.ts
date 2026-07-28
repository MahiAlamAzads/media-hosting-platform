import { LegacyModuleService } from "../../core/service/legacy-module.service.js";
import type { StripeCallbackHttpRepository } from "./stripe-callback.facade.repository.js";
import type { StripeCallbackHttpValidation } from "./stripe-callback.facade.validation.js";
export class StripeCallbackHttpService extends LegacyModuleService { constructor(repository:StripeCallbackHttpRepository, validation:StripeCallbackHttpValidation) { super(repository,validation); } }
