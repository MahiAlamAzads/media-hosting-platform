import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("Phase 5 protected routes", () => {
  it.each([
    ["GET", "/api/v1/media/c1234567890123456789012345"],
    ["PATCH", "/api/v1/media/c1234567890123456789012345"],
    ["DELETE", "/api/v1/media/c1234567890123456789012345/permanent"],
    ["POST", "/api/v1/media/bulk"],
    ["GET", "/api/v1/folders/c1234567890123456789012345"],
    ["PATCH", "/api/v1/folders/c1234567890123456789012345"],
    ["GET", "/api/v1/usage/summary"],
    ["GET", "/api/v1/audit-logs"]
  ])("%s %s requires authentication", async (method, route) => {
    const agent = request(app);
    const normalizedMethod = method.toLowerCase();

    const response =
      normalizedMethod === "get"
        ? await agent.get(route)
        : normalizedMethod === "patch"
          ? await agent.patch(route).send({})
          : normalizedMethod === "post"
            ? await agent.post(route).send({})
            : await agent.delete(route);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });
});
