import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("important API contract smoke tests", () => {
  describe("health", () => {
    it("GET /health/live returns 200", async () => {
      const response = await request(app)
        .get("/health/live")
        .expect(200);

      expect(response.body).toEqual({ status: "ok" });
    });

    it("GET /health/ready returns 200", async () => {
      const response = await request(app)
        .get("/health/ready")
        .expect(200);

      expect(response.body).toEqual({ status: "ready" });
    });
  });

  describe("authentication validation", () => {
    it("POST /api/v1/auth/register validates body", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({})
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/auth/login validates body", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({})
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/auth/verify-email validates token", async () => {
      const response = await request(app)
        .post("/api/v1/auth/verify-email")
        .send({})
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/auth/forgot-password validates email", async () => {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "invalid" })
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/auth/reset-password validates token and password", async () => {
      const response = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({})
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("protected APIs", () => {
    it.each([
      ["POST", "/api/v1/uploads"],
      ["GET", "/api/v1/uploads/c1234567890123456789012345"],
      ["DELETE", "/api/v1/uploads/c1234567890123456789012345"],
      ["GET", "/api/v1/media"],
      ["POST", "/api/v1/media/c1234567890123456789012345/delivery-token"],
      ["PATCH", "/api/v1/media/c1234567890123456789012345/visibility"],
      ["DELETE", "/api/v1/media/c1234567890123456789012345"],
      ["GET", "/api/v1/folders"],
      ["POST", "/api/v1/folders"],
      ["DELETE", "/api/v1/folders/c1234567890123456789012345"]
    ])("%s %s rejects unauthenticated requests", async (method, route) => {
      const agent = request(app);
      const normalizedMethod = method.toLowerCase();

      const response =
        normalizedMethod === "get"
          ? await agent.get(route)
          : normalizedMethod === "post"
            ? await agent.post(route).send({})
            : normalizedMethod === "patch"
              ? await agent.patch(route).send({})
              : await agent.delete(route).send({});

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_REQUIRED");
    });
  });

  describe("delivery", () => {
    it("GET /api/v1/delivery/:token rejects invalid tokens", async () => {
      const response = await request(app)
        .get("/api/v1/delivery/not-a-valid-token")
        .expect(401);

      expect(response.body.error.code).toBe("INVALID_DELIVERY_TOKEN");
    });
  });

  describe("unknown route", () => {
    it("returns structured 404", async () => {
      const response = await request(app)
        .get("/api/v1/not-implemented")
        .expect(404);

      expect(response.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found."
        }
      });
    });
  });
});
