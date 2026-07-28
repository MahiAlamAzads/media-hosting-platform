import { z } from "zod";
export class DeliveryValidation { readonly token=z.string().min(1).max(4096); readonly rangeHeader=z.string().max(256).optional(); }
