import type { ApiModuleDescriptor } from "../../core/module/api-module.js";
import router from "./api-key.route.js";
export const apiKeyModule: ApiModuleDescriptor={name:"api-keys",mountPath:"/api/v1/api-keys",router};
