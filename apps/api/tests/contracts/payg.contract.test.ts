import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  new URL("../../src/app.ts", import.meta.url),
  "utf8"
);
const schemaSource = readFileSync(
  new URL("../../../../packages/database/prisma/schema.prisma", import.meta.url),
  "utf8"
);
const paygModuleSource = readFileSync(
  new URL("../../src/modules/billing/payg.module.ts", import.meta.url),
  "utf8"
);
const openapi = JSON.parse(
  readFileSync(
    new URL("../../src/openapi/openapi.json", import.meta.url),
    "utf8"
  )
) as { paths: Record<string, unknown> };

describe("Phase 13 PAYG contracts", () => {
  it("mounts the authenticated PAYG module through the registry", () => {
    const registry = readFileSync(
      new URL("../../src/modules/module-registry.ts", import.meta.url),
      "utf8"
    );
    expect(appSource).toContain("for (const module of apiModules)");
    expect(registry).toContain(
      'from "./billing/payg.module.js"'
    );
    expect(registry).toContain("paygModule");
    expect(paygModuleSource).toContain(
      'mountPath:"/api/v1/billing"'
    );
  });

  it("mounts raw-body modules before JSON parsing", () => {
    const rawModules = appSource.indexOf(
      "for (const module of rawBodyApiModules)"
    );
    const json = appSource.indexOf("app.use(express.json");
    expect(rawModules).toBeGreaterThan(-1);
    expect(json).toBeGreaterThan(rawModules);
  });

  it("documents the PAYG and tokenized-card endpoints", () => {
    for (const path of [
      "/api/v1/billing/payg",
      "/api/v1/billing/payment-methods/setup-session",
      "/api/v1/billing/payment-methods/sync",
      "/api/v1/billing/payment-methods/{paymentMethodId}/default",
      "/api/v1/billing/payment-methods/{paymentMethodId}",
      "/api/v1/payment-callbacks/stripe"
    ]) {
      expect(openapi.paths[path]).toBeDefined();
    }
  });

  it("stores provider tokens and display metadata, not raw card secrets", () => {
    expect(schemaSource).toContain("providerPaymentMethodId String");
    expect(schemaSource).toContain("last4");
    expect(schemaSource).not.toMatch(/\b(cardNumber|pan|cvv|cvc)\b/i);
  });
});
