import { Router } from "express";
import { storageFileSize } from "../../infrastructure/storage.js";
import { asyncHandler } from "../../shared/http.js";
import { DeliveryController } from "./delivery.controller.js";
import { PrismaDeliveryRepository } from "./delivery.repository.js";
import { DeliveryService } from "./delivery.service.js";

const repository = new PrismaDeliveryRepository();

const service = new DeliveryService(repository, {
  fileSize: storageFileSize
});

const controller = new DeliveryController(service);

const router = Router();

router.get(
  "/:token",
  asyncHandler(controller.stream)
);

export default router;
