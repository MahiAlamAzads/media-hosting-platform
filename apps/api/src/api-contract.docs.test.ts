import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("API documentation", () => {
  it("serves OpenAPI 3.1 JSON", async () => {
    const response = await request(app)
      .get("/api/v1/docs/openapi.json")
      .expect(200);

    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths["/api/v1/media"]).toBeDefined();
    expect(response.body.components.securitySchemes.BearerAuth).toBeDefined();
  });
});
