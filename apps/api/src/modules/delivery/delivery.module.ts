import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import router from "./delivery.route.js";
export const deliveryModule: ApiModuleDescriptor={name:"delivery",mountPath:"/api/v1/delivery",router};
