import { Router, type RequestHandler } from "express";
export class LegacyModuleRoute { readonly router=Router(); constructor(controller:{readonly handle:RequestHandler}) { this.router.use(controller.handle); } }
