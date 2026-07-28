import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

const openapi = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./openapi/openapi.json", import.meta.url)),
    "utf8"
  )
);

describe("internal API documentation", () => {
  it("does not expose OpenAPI without an authenticated platform administrator", async () => {
    const response = await request(app)
      .get("/api/v1/docs/openapi.json")
      .expect(401);

    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("keeps a valid OpenAPI 3.1 internal contract in source", () => {
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.paths["/api/v1/media"]).toBeDefined();
    expect(openapi.components.securitySchemes.BearerAuth).toBeDefined();
  });
});
