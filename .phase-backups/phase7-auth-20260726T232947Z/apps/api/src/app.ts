import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import authRouter from "./modules/auth/auth.js";
import uploadsRouter from "./modules/uploads/uploads.js";
import mediaRouter from "./modules/media/media.js";
import foldersRouter from "./modules/folders/folders.js";
import deliveryRouter from "./modules/delivery/delivery.js";
import apiKeyRouter from "./modules/api-keys/api-key.route.js";
import securityRouter from "./modules/security/security.route.js";
import usageRouter from "./modules/usage/usage.route.js";
import auditRouter from "./modules/audit/audit.route.js";
import publicMediaRouter from "./modules/public/public-media.route.js";
import variantsRouter from "./modules/variants/variants.route.js";
import { env } from "./config/env.js";
import { AppError } from "./shared/http.js";
import { storageHealth } from "./infrastructure/storage.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  req.id = req.get("x-request-id") || randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
});

app.use(
  pinoHttp({
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.token",
      "req.body.rawKey"
    ]
  })
);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins = env.CORS_ALLOWED_ORIGINS
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError(
          403,
          "CORS_REJECTED",
          "Origin is not allowed."
        )
      );
    },
    credentials: true
  })
);

app.use(cookieParser());

app.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/ready", (_req, res) => {
  res.json({ status: "ready" });
});

app.get("/health/storage", async (_req, res, next) => {
  try {
    res.json(await storageHealth());
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/public", publicMediaRouter);
app.use("/api/v1/delivery", deliveryRouter);
app.use("/api/v1/uploads", uploadsRouter);

app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false
  })
);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/security", securityRouter);
app.use("/api/v1/api-keys", apiKeyRouter);
app.use("/api/v1/media", mediaRouter);
app.use("/api/v1/folders", foldersRouter);
app.use("/api/v1/usage", usageRouter);
app.use("/api/v1/audit-logs", auditRouter);
app.use("/api/v1/variants", variantsRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found."
    }
  });
});

const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next
) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid fields.",
        fields: error.flatten().fieldErrors,
        requestId: req.id
      }
    });
    return;
  }

  const statusCode =
    error instanceof AppError
      ? error.statusCode
      : 500;

  const code =
    error instanceof AppError
      ? error.code
      : "INTERNAL_ERROR";

  req.log.error({ err: error }, "request failed");

  res.status(statusCode).json({
    error: {
      code,
      message:
        statusCode === 500
          ? "An unexpected error occurred."
          : error.message,
      requestId: req.id
    }
  });
};

app.use(errorHandler);
