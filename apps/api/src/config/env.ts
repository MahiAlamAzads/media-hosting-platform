import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_URL: z.string().url(),
    API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
    CDN_PUBLIC_URL: z.string().url().optional(),
    DATABASE_URL: z.string().min(1),
    ACCESS_TOKEN_SECRET: z.string().min(64),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    API_KEY_PEPPER: z.string().min(32),
    COOKIE_SECURE: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
    CORS_ALLOWED_ORIGINS: z.string().min(1),
    REDIS_URL: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z
        .string()
        .trim()
        .regex(/^rediss?:\/\//, "REDIS_URL must use redis:// or rediss://.")
        .optional(),
    ),
    REDIS_REQUIRED: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    REDIS_KEY_PREFIX: z.string().trim().min(1).default("media-platform"),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30000)
      .default(5000),
    REDIS_PUBLIC_MEDIA_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(3600)
      .default(300),
    REDIS_PUBLIC_VARIANT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(86400)
      .default(3600),
    REDIS_PRICING_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(3600)
      .default(300),
    REDIS_AUTH_TOUCH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(300),
    REDIS_USAGE_ALERT_DEBOUNCE_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .default(2),
    REDIS_LOCAL_CACHE_MAX_ENTRIES: z.coerce
      .number()
      .int()
      .min(50)
      .max(10000)
      .default(1000),
    REDIS_LOCAL_CACHE_FALLBACK_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .default(5),
    IMAGE_OPTIMIZATION_ENABLED: z
      .string()
      .default("true")
      .transform((value) => value === "true"),
    IMAGE_OPTIMIZATION_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .default(2),
    IMAGE_OPTIMIZATION_SWEEP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(5000)
      .max(300000)
      .default(15000),
    IMAGE_OPTIMIZATION_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25),
    IMAGE_OPTIMIZATION_LOCK_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(600),
    IMAGE_OPTIMIZATION_OUTPUT_FORMAT: z.enum(["webp", "avif"]).default("webp"),
    IMAGE_OPTIMIZATION_EFFORT: z.coerce.number().int().min(0).max(6).default(4),
    IMAGE_OPTIMIZATION_MAX_INPUT_PIXELS: z.coerce
      .number()
      .int()
      .min(1000000)
      .max(500000000)
      .default(100000000),
    IMAGE_THUMBNAIL_MAX_SIZE: z.coerce
      .number()
      .int()
      .min(64)
      .max(1024)
      .default(320),
    IMAGE_THUMBNAIL_QUALITY: z.coerce
      .number()
      .int()
      .min(40)
      .max(100)
      .default(78),
    IMAGE_PREVIEW_MAX_SIZE: z.coerce
      .number()
      .int()
      .min(320)
      .max(4096)
      .default(1600),
    IMAGE_PREVIEW_QUALITY: z.coerce.number().int().min(40).max(100).default(82),
    PLATFORM_ADMIN_EMAILS: z.string().default(""),
    MANUAL_PAYMENT_ENABLED: z
      .string()
      .default("true")
      .transform((value) => value === "true"),
    MANUAL_PAYMENT_PROOF_REQUIRED: z
      .string()
      .default("true")
      .transform((value) => value === "true"),
    MANUAL_PAYMENT_PROOF_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(20 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    SSLCOMMERZ_ENABLED: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    SSLCOMMERZ_SANDBOX: z
      .string()
      .default("true")
      .transform((value) => value === "true"),
    SSLCOMMERZ_STORE_ID: z.string().trim().optional(),
    SSLCOMMERZ_STORE_PASSWORD: z.string().trim().optional(),
    SSLCOMMERZ_AUTO_APPROVE_RISKY: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    PAYMENT_RENEWAL_LEAD_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(30)
      .default(7),
    PAYMENT_GRACE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    PAYG_ENABLED: z
      .string()
      .default("true")
      .transform((value) => value === "true"),
    PAYG_CARD_PROVIDER: z.enum(["STRIPE", "SSLCOMMERZ"]).default("STRIPE"),
    PAYG_DEFAULT_MONTHLY_CAP_BDT_MINOR: z.coerce
      .number()
      .int()
      .positive()
      .default(500000),
    PAYG_DEFAULT_MONTHLY_CAP_USD_MINOR: z.coerce
      .number()
      .int()
      .positive()
      .default(5000),
    PAYG_DEFAULT_CHARGE_THRESHOLD_BDT_MINOR: z.coerce
      .number()
      .int()
      .positive()
      .default(50000),
    PAYG_DEFAULT_CHARGE_THRESHOLD_USD_MINOR: z.coerce
      .number()
      .int()
      .positive()
      .default(500),
    PAYG_AUTHORIZATION_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(1440)
      .default(30),
    PAYG_PROCESSING_AUTHORIZATION_MILLISECONDS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(3600000)
      .default(60000),
    PAYG_MINIMUM_TOPUP_BDT_MINOR: z.coerce
      .number()
      .int()
      .positive()
      .default(50000),
    PAYG_MINIMUM_TOPUP_USD_MINOR: z.coerce
      .number()
      .int()
      .positive()
      .default(500),
    PAYG_LOW_BALANCE_BDT_MINOR: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(10000),
    PAYG_LOW_BALANCE_USD_MINOR: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(100),
    ENTERPRISE_SALES_EMAIL: z
      .string()
      .trim()
      .email()
      .default("sales@example.com"),
    STRIPE_PAYG_ENABLED: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    STRIPE_SECRET_KEY: z.string().trim().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().trim().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().trim().optional(),
    MEDIA_STORAGE_ROOT: z.string().min(1),
    MEDIA_STORAGE_RESERVED_BYTES: z.coerce
      .number()
      .nonnegative()
      .default(10737418240),
    MEDIA_SIGNING_SECRET: z.string().min(64),
    DELIVERY_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86400)
      .default(900),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_SECURE: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM_NAME: z.string().min(1),
    SMTP_FROM_EMAIL: z.string(),
  })
  .superRefine((value, context) => {
    if (value.REDIS_REQUIRED && !value.REDIS_URL) {
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "REDIS_URL is required when REDIS_REQUIRED is true.",
      });
    }

    if (value.SSLCOMMERZ_ENABLED) {
      if (!value.SSLCOMMERZ_STORE_ID) {
        context.addIssue({
          code: "custom",
          path: ["SSLCOMMERZ_STORE_ID"],
          message:
            "SSLCOMMERZ_STORE_ID is required when SSLCOMMERZ is enabled.",
        });
      }

      if (!value.SSLCOMMERZ_STORE_PASSWORD) {
        context.addIssue({
          code: "custom",
          path: ["SSLCOMMERZ_STORE_PASSWORD"],
          message:
            "SSLCOMMERZ_STORE_PASSWORD is required when SSLCOMMERZ is enabled.",
        });
      }

      const callbackUrl = new URL(value.API_PUBLIC_URL);
      if (
        ["localhost", "127.0.0.1", "0.0.0.0"].includes(callbackUrl.hostname)
      ) {
        context.addIssue({
          code: "custom",
          path: ["API_PUBLIC_URL"],
          message:
            "API_PUBLIC_URL must be a publicly reachable callback URL when SSLCOMMERZ is enabled.",
        });
      }

      if (!value.SSLCOMMERZ_SANDBOX && callbackUrl.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["API_PUBLIC_URL"],
          message: "Live SSLCOMMERZ callbacks require an HTTPS API_PUBLIC_URL.",
        });
      }
    }

    if (value.STRIPE_PAYG_ENABLED) {
      if (!value.STRIPE_SECRET_KEY) {
        context.addIssue({
          code: "custom",
          path: ["STRIPE_SECRET_KEY"],
          message: "STRIPE_SECRET_KEY is required when Stripe PAYG is enabled.",
        });
      }
      if (!value.STRIPE_PUBLISHABLE_KEY) {
        context.addIssue({
          code: "custom",
          path: ["STRIPE_PUBLISHABLE_KEY"],
          message:
            "STRIPE_PUBLISHABLE_KEY is required when Stripe PAYG is enabled.",
        });
      }
      if (!value.STRIPE_WEBHOOK_SECRET) {
        context.addIssue({
          code: "custom",
          path: ["STRIPE_WEBHOOK_SECRET"],
          message:
            "STRIPE_WEBHOOK_SECRET is required when Stripe PAYG is enabled.",
        });
      }
    }
  });

export const env = schema.parse(process.env);
