import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../..");

const protectedBillingRoutes = [
  ["get", "/api/v1/billing/revenue-options"],
  ["get", "/api/v1/billing/wallet"],
  ["post", "/api/v1/billing/wallet/topups"],
  ["post", "/api/v1/billing/subscription-offers/select"],
  ["patch", "/api/v1/billing/revenue-model"],
  ["post", "/api/v1/billing/enterprise-inquiries"],
] as const;

const protectedAdminRoutes = [
  ["post", "/api/v1/admin/console/users"],
  ["get", "/api/v1/admin/console/users/example-user"],
  ["patch", "/api/v1/admin/console/users/example-user"],
  ["delete", "/api/v1/admin/console/users/example-user"],
  ["get", "/api/v1/admin/console/wallets"],
  ["post", "/api/v1/admin/console/wallets/example-workspace/adjust"],
  ["get", "/api/v1/admin/console/enterprise-inquiries"],
  ["patch", "/api/v1/admin/console/enterprise-inquiries/example-inquiry"],
] as const;

describe("Phase 14 dual revenue contract", () => {
  for (const [method, path] of [
    ...protectedBillingRoutes,
    ...protectedAdminRoutes,
  ]) {
    it(`protects ${method.toUpperCase()} ${path}`, async () => {
      const agent = request(app);
      const pending =
        method === "get"
          ? agent.get(path)
          : method === "post"
            ? agent.post(path)
            : method === "patch"
              ? agent.patch(path)
              : agent.delete(path);
      const response = await pending.expect(401);
      expect(response.body.error.code).toBe("AUTH_REQUIRED");
    });
  }

  it("documents revenue, wallet, subscription term and admin CRUD routes", async () => {
    const document = JSON.parse(
      await readFile(
        resolve(currentDirectory, "../../src/openapi/openapi.json"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };

    const expectedPaths = [
      "/api/v1/billing/revenue-options",
      "/api/v1/billing/wallet",
      "/api/v1/billing/wallet/topups",
      "/api/v1/billing/subscription-offers/select",
      "/api/v1/billing/revenue-model",
      "/api/v1/billing/enterprise-inquiries",
      "/api/v1/admin/console/users/{userId}",
      "/api/v1/admin/console/wallets",
      "/api/v1/admin/console/wallets/{workspaceId}/adjust",
      "/api/v1/admin/console/enterprise-inquiries",
      "/api/v1/admin/console/enterprise-inquiries/{inquiryId}",
      "/api/v1/admin/plans/{planId}/versions/{versionId}/offers",
    ];

    for (const path of expectedPaths) {
      expect(document.paths[path]).toBeDefined();
    }
  });

  it("keeps prepaid wallet data free from raw card fields", async () => {
    const schema = await readFile(
      resolve(repositoryRoot, "packages/database/prisma/schema.prisma"),
      "utf8",
    );

    expect(schema).toContain("model PrepaidWallet");
    expect(schema).toContain("model WalletTransaction");
    expect(schema).toContain("model PlanOffer");
    expect(schema).toContain("enum SubscriptionTerm");
    expect(schema).toContain("THREE_MONTHS");
    expect(schema).toContain("SIX_MONTHS");
    expect(schema).toContain("ONE_YEAR");
    expect(schema).not.toMatch(/\b(cardNumber|fullPan|cvv|cvc|pin|otp)\b/i);
  });

  it("ships the append-only Phase 14 migration", async () => {
    const migration = await readFile(
      resolve(
        repositoryRoot,
        "packages/database/prisma/migrations/20260727233000_phase14_dual_revenue_prepaid_wallets/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "PrepaidWallet"');
    expect(migration).toContain('CREATE TABLE "WalletTransaction"');
    expect(migration).toContain('CREATE TABLE "PlanOffer"');
    expect(migration).toContain('CREATE TABLE "EnterpriseInquiry"');
    expect(migration).toContain("WALLET_TOPUP");
  });
});
