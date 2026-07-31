import type { Router } from "express";
export interface ApiModuleDescriptor {
  readonly name: string;
  readonly mountPath: string;
  readonly router: Router;
}
export interface RawBodyApiModuleDescriptor extends ApiModuleDescriptor {
  readonly rawBody: { readonly type: string; readonly limit: string };
}
