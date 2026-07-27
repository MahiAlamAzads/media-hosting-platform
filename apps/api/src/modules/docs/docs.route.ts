import { Router } from "express";
import openapi from "../../openapi/openapi.json" with { type: "json" };

const router = Router();

router.get("/openapi.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(openapi);
});

router.get("/", (_req, res) => {
  res.redirect("/api/v1/docs/openapi.json");
});

export default router;
