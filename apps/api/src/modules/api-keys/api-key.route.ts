import { Router } from "express";
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../shared/http.js";
import { ApiKeyController } from "./api-key.controller.js";
import { ApiKeyRepository } from "./api-key.repository.js";
import { ApiKeyService } from "./api-key.service.js";

const repository = new ApiKeyRepository();
const service = new ApiKeyService(repository);
const controller = new ApiKeyController(service);

const router = Router();

router.use(authenticate, requireUser);

router.get("/", asyncHandler(controller.list));
router.post("/", asyncHandler(controller.create));
router.delete("/:apiKeyId", asyncHandler(controller.revoke));

export default router;
