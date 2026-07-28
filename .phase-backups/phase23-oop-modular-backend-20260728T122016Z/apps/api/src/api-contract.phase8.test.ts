import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("Phase 8 pricing and billing contracts", () => {
  it.each([
    ["GET", "/api/v1/billing/subscription"],
    ["GET", "/api/v1/billing/usage"],
    ["GET", "/api/v1/billing/plans"],
    ["GET", "/api/v1/admin/plans"],
    ["GET", "/api/v1/admin/subscriptions"],
    ["GET", "/api/v1/admin/usage"]
  ])("%s %s requires authentication", async (method, route) => {
    const agent = request(app);
    const response = method === "GET"
      ? await agent.get(route)
      : await agent.post(route).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("documents the dual-currency pricing and administration surface internally", () => {
    const openapi = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("./openapi/openapi.json", import.meta.url)),
        "utf8"
      )
    );

    expect(openapi.paths["/api/v1/pricing"]).toBeDefined();
    expect(openapi.paths["/api/v1/billing/usage"]).toBeDefined();
    expect(openapi.paths["/api/v1/billing/select-plan"]).toBeDefined();
    expect(openapi.paths["/api/v1/admin/plans"]).toBeDefined();
    expect(
      openapi.paths[
        "/api/v1/admin/subscriptions/{workspaceId}/changes/{changeId}/reject"
      ]
    ).toBeDefined();
  });
});
