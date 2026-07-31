import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("health endpoints", () => {
  it("returns liveness", async () => {
    const response = await request(app).get("/health/live").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns readiness", async () => {
    const response = await request(app).get("/health/ready").expect(200);

    expect(response.body).toEqual({ status: "ready" });
  });

  it("returns structured not-found errors", async () => {
    const response = await request(app).get("/missing-route").expect(404);

    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });
});
