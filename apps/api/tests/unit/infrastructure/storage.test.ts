import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/shared/http.js";
import { resolveStorageKey } from "../../../src/infrastructure/storage.js";

describe("resolveStorageKey", () => {
  it("accepts a tenant-relative storage key", () => {
    const resolved = resolveStorageKey(
      "tenants/workspace-1/originals/asset-1/file.mp4",
    );

    expect(resolved).toContain(
      "tenants/workspace-1/originals/asset-1/file.mp4",
    );
  });

  it.each([
    "../../etc/passwd",
    "../outside",
    "/etc/passwd",
    "tenants\\workspace-1\\file.mp4",
  ])("rejects unsafe storage key %s", (storageKey) => {
    expect(() => resolveStorageKey(storageKey)).toThrow(AppError);
  });
});
