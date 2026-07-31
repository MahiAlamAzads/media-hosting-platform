import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { meterAuthenticatedApiRequest } from "./middleware/usage-meter.js";
import { env } from "./config/env.js";
import { AppError } from "./shared/http.js";
import { storageHealth } from "./infrastructure/storage.js";
import { getRedisHealth } from "./infrastructure/redis.js";
import { RedisRateLimitStore } from "./infrastructure/redis-rate-limit-store.js";
import { apiModules, rawBodyApiModules } from "./modules/module-registry.js";

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
      "req.body.rawKey",
    ],
  }),
);

app.use(helmet());
const restrictedCors = cors({
  origin(origin, callback) {
    const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError(403, "CORS_REJECTED", "Origin is not allowed."));
  },
  credentials: true,
});

app.use((req, res, next) => {
  const isPublicMediaRequest =
    req.path.startsWith("/i/") || req.path.startsWith("/api/v1/public/media/");

  if (isPublicMediaRequest) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Range, If-None-Match, If-Modified-Since",
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Type, Cache-Control, ETag",
    );

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
    return;
  }

  restrictedCors(req, res, next);
});

app.use(cookieParser());

app.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/ready", (_req, res) => {
  const redis = getRedisHealth();
  const ready = !redis.required || redis.isReady;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
  });
});

app.get("/health/redis", (_req, res) => {
  const redis = getRedisHealth();
  res.status(redis.required && !redis.isReady ? 503 : 200).json({
    configured: redis.configured,
    required: redis.required,
    status: redis.status,
    isReady: redis.isReady,
  });
});

app.get("/health/storage", async (_req, res, next) => {
  try {
    res.json(await storageHealth());
  } catch (error) {
    next(error);
  }
});

// Raw-body modules must be mounted before the global JSON parser.
for (const module of rawBodyApiModules) {
  app.use(
    module.mountPath,
    express.raw({ type: module.rawBody.type, limit: module.rawBody.limit }),
    module.router,
  );
}

// JSON parsing must run before upload initialization. It does not consume
// application/octet-stream chunk bodies, which keep their route-level parser.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "128kb" }));

const standardApiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new RedisRateLimitStore("standard"),
});

const publicMediaLimiter = rateLimit({
  windowMs: 60_000,
  limit: 3_000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new RedisRateLimitStore("public-media"),
});

app.use((req, res, next) => {
  const isPublicMediaRequest =
    req.path.startsWith("/i/") || req.path.startsWith("/api/v1/public/media/");

  const limiter = isPublicMediaRequest
    ? publicMediaLimiter
    : standardApiLimiter;

  limiter(req, res, next);
});

app.use(meterAuthenticatedApiRequest);

for (const module of apiModules) {
  app.use(module.mountPath, module.router);
}

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found.",
    },
  });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid fields.",
        fields: error.flatten().fieldErrors,
        requestId: req.id,
      },
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
        statusCode === 500 ? "An unexpected error occurred." : error.message,
      ...(error instanceof AppError && error.details ? error.details : {}),
      requestId: req.id,
    },
  });
};

app.use(errorHandler);
