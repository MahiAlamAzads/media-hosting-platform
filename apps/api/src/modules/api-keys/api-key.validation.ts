import { z } from "zod";
import { API_KEY_SCOPES } from "../../shared/api-key.js";
export class ApiKeyValidation { readonly create=z.object({name:z.string().trim().min(2).max(80),scopes:z.array(z.enum(API_KEY_SCOPES)).min(1),expiresAt:z.coerce.date().nullable().optional()}); readonly routeId=z.string().cuid(); }
