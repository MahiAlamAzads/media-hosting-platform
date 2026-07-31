import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

const protectedRoutes = [
  "/api/v1/admin/console/overview",
  "/api/v1/admin/console/users",
  "/api/v1/admin/console/workspaces",
  "/api/v1/admin/console/operations",
  "/api/v1/admin/console/audit",
  "/api/v1/admin/console/security-events",
  "/api/v1/admin/console/system",
];

describe("advanced admin console contract", () => {
  for (const path of protectedRoutes) {
    it(`protects ${path}`, async () => {
      const response = await request(app).get(path).expect(401);
      expect(response.body.error.code).toBe("AUTH_REQUIRED");
    });
  }
});
