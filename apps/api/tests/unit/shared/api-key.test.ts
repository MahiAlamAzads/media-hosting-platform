import { describe, expect, it } from "vitest";
import {
  createApiKeyMaterial,
  hashApiKeySecret,
  parseApiKey,
} from "../../../src/shared/api-key.js";

describe("API key helpers", () => {
  it("creates a parseable key", () => {
    const material = createApiKeyMaterial();
    const parsed = parseApiKey(material.rawKey);

    expect(parsed).not.toBeNull();
    expect(parsed?.keyId).toBe(material.keyId);
    expect(hashApiKeySecret(parsed!.secret)).toBe(material.secretHash);
  });

  it.each([
    "",
    "mh_live_invalid",
    "Bearer mh_live_key.secret",
    "mh_test_key.secret",
    "mh_live_short.short",
  ])("rejects malformed key %s", (rawKey) => {
    expect(parseApiKey(rawKey)).toBeNull();
  });
});
