import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http.js";
import { getPublicPricing } from "../billing/billing.service.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const currency = z
      .enum(["BDT", "USD"])
      .default("BDT")
      .parse(req.query.currency);

    const plans = await getPublicPricing(currency);

    res.json({
      data: {
        currency,
        plans,
      },
      meta: { requestId: req.id },
    });
  }),
);

export default router;
