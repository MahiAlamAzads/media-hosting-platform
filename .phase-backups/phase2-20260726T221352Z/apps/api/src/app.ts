import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import authRouter from "./modules/auth/auth.js";
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
      "req.body.token"
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

      callback(new AppError(403, "CORS_REJECTED", "Origin is not allowed."));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false
  })
);

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

app.use("/api/v1/auth", authRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found."
    }
  });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
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

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";

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
