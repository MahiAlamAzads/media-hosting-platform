import { Router } from "express";
import openapi from "../../openapi/openapi.json" with { type: "json" };
import { authenticate, requireUser } from "../../middleware/authenticate.js";
import { requirePlatformAdmin } from "../../middleware/platform-admin.js";

const router = Router();

router.use(authenticate, requireUser, requirePlatformAdmin);

router.get("/openapi.json", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(openapi);
});

router.get("/", (_req, res) => {
  res.redirect("/api/v1/docs/openapi.json");
});

export default router;
