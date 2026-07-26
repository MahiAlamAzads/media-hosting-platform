import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("Phase 6 API contracts", () => {
  it("rejects a missing public asset", async () => {
    const response = await request(app)
      .get("/api/v1/public/media/c1234567890123456789012345")
      .expect(404);

    expect(response.body.error.code).toBe("MEDIA_NOT_FOUND");
  });

  it.each([
    ["GET", "/api/v1/variants/media/c1234567890123456789012345"],
    ["POST", "/api/v1/variants/media/c1234567890123456789012345/process"]
  ])("%s %s requires authentication", async (method, route) => {
    const agent = request(app);

    const response =
      method === "GET"
        ? await agent.get(route)
        : await agent.post(route).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });
});
