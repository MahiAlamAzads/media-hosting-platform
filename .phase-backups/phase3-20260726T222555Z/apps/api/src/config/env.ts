import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(64),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z.string().default("false").transform(v => v === "true"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  MEDIA_STORAGE_ROOT: z.string().min(1),
  MEDIA_STORAGE_RESERVED_BYTES: z.coerce.number().nonnegative().default(10737418240),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.string().default("false").transform(v => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_NAME: z.string().min(1),
  SMTP_FROM_EMAIL: z.string().email()
});

export const env = schema.parse(process.env);
