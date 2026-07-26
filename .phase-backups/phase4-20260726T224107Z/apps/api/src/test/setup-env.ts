import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDirectory, "../../../..");

dotenv.config({
  path: path.join(workspaceRoot, ".env"),
  override: false,
  quiet: true
});

process.env.NODE_ENV = "test";

process.env.WEB_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??=
  "postgresql://media_test:media_test@127.0.0.1:5432/media_test";
process.env.ACCESS_TOKEN_SECRET ??= "a".repeat(64);
process.env.ACCESS_TOKEN_TTL ??= "15m";
process.env.REFRESH_TOKEN_PEPPER ??= "b".repeat(64);
process.env.REFRESH_TOKEN_TTL_DAYS ??= "30";
process.env.COOKIE_SECURE ??= "false";
process.env.COOKIE_SAME_SITE ??= "lax";
process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:3000";
process.env.MEDIA_STORAGE_ROOT ??= path.join(workspaceRoot, ".test-storage");
process.env.MEDIA_STORAGE_RESERVED_BYTES ??= "0";
process.env.MEDIA_SIGNING_SECRET ??= "c".repeat(64);
process.env.DELIVERY_TOKEN_TTL_SECONDS ??= "900";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_SECURE ??= "false";
process.env.SMTP_FROM_NAME ??= "Media Platform Test";
process.env.SMTP_FROM_EMAIL ??= "test@example.com";
