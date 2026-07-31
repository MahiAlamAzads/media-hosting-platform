import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe("Phase 19 admin billing control contract", () => {
  const protectedRoutes = [
    ["get", "/api/v1/admin/console/billing-control"],
    ["post", "/api/v1/admin/subscriptions/example-workspace/manual-override"],
    ["patch", "/api/v1/admin/console/wallets/example-workspace"],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    it(`protects ${method.toUpperCase()} ${path}`, async () => {
      const agent = request(app);
      const response =
        method === "get"
          ? await agent.get(path)
          : method === "post"
            ? await agent.post(path)
            : await agent.patch(path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_REQUIRED");
    });
  }

  it("documents the admin billing-control operations", async () => {
    const document = JSON.parse(
      await readFile(
        resolve(currentDirectory, "../../src/openapi/openapi.json"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };

    expect(
      document.paths["/api/v1/admin/console/billing-control"]?.get,
    ).toBeDefined();
    expect(
      document.paths[
        "/api/v1/admin/subscriptions/{workspaceId}/manual-override"
      ]?.post,
    ).toBeDefined();
    expect(
      document.paths["/api/v1/admin/console/wallets/{workspaceId}"]?.patch,
    ).toBeDefined();
  });

  it("keeps every manual commercial change auditable", async () => {
    const plansRoute = await readFile(
      resolve(
        currentDirectory,
        "../../src/modules/admin/admin-plans.legacy.ts",
      ),
      "utf8",
    );
    const consoleRoute = await readFile(
      resolve(
        currentDirectory,
        "../../src/modules/admin/admin-console.legacy.ts",
      ),
      "utf8",
    );

    expect(plansRoute).toContain("subscription.admin_override");
    expect(plansRoute).toContain("cancelPendingRequests");
    expect(consoleRoute).toContain("platform.wallet.adjusted");
    expect(consoleRoute).toContain("platform.wallet.settings_updated");
  });
});
