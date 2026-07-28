import { describe, expect, it } from "vitest";
import {
  buildMediaUrlsForBase,
  publicMediaPath
} from "./media-url.js";

describe("Phase 15 media URL contract", () => {
  it("returns a stable imgUrl for a ready public image", () => {
    expect(
      buildMediaUrlsForBase("https://cdn.alamahi.cloud/", {
        assetId: "cm123",
        visibility: "PUBLIC",
        status: "READY",
        detectedMediaType: "IMAGE",
        readyVariants: ["THUMBNAIL"]
      })
    ).toEqual({
      isPublic: true,
      cdnPath: "/i/cm123",
      fileUrl: "https://cdn.alamahi.cloud/i/cm123",
      imgUrl: "https://cdn.alamahi.cloud/i/cm123",
      thumbnailUrl:
        "https://cdn.alamahi.cloud/i/cm123?variant=THUMBNAIL",
      previewUrl: null
    });
  });

  it("does not expose a permanent URL for private media", () => {
    expect(
      buildMediaUrlsForBase("http://localhost:4000", {
        assetId: "cm123",
        visibility: "PRIVATE",
        status: "READY",
        detectedMediaType: "IMAGE"
      })
    ).toEqual({
      isPublic: false,
      cdnPath: null,
      fileUrl: null,
      imgUrl: null,
      thumbnailUrl: null,
      previewUrl: null
    });
  });

  it("returns fileUrl but not imgUrl for a public non-image file", () => {
    const urls = buildMediaUrlsForBase("http://localhost:4000", {
      assetId: "cm456",
      visibility: "PUBLIC",
      status: "READY",
      detectedMediaType: "DOCUMENT"
    });

    expect(urls.fileUrl).toBe("http://localhost:4000/i/cm456");
    expect(urls.imgUrl).toBeNull();
  });

  it("builds encoded short CDN paths", () => {
    expect(publicMediaPath("cm123", "PREVIEW")).toBe(
      "/i/cm123?variant=PREVIEW"
    );
  });
});
