import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(packageDirectory, "../../.env") });

const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL must be configured.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: migrationUrl
  }
});
