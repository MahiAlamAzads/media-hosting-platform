import { describe, expect, it } from "vitest";
import {
  normalizeResourceName,
  replacePathPrefix
} from "./path-key.js";

describe("normalizeResourceName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeResourceName("  My   Folder  ")).toBe("My Folder");
  });
});

describe("replacePathPrefix", () => {
  it("replaces an exact path", () => {
    expect(replacePathPrefix("photos", "photos", "images")).toBe("images");
  });

  it("replaces a descendant prefix", () => {
    expect(
      replacePathPrefix("photos/2026/july", "photos", "images")
    ).toBe("images/2026/july");
  });

  it("does not replace a partial name match", () => {
    expect(
      replacePathPrefix("photos-old/2026", "photos", "images")
    ).toBe("photos-old/2026");
  });
});
