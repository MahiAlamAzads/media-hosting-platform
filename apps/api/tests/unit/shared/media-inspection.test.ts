import { describe, expect, it, vi } from "vitest";
import * as storage from "../../../src/infrastructure/storage.js";
import {
  declaredTypeMatchesDetectedType,
  inspectStoredMedia
} from "../../../src/shared/media-inspection.js";

describe("inspectStoredMedia", () => {
  it("detects JPEG", async () => {
    vi.spyOn(storage, "readStoragePrefix").mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    );

    await expect(
      inspectStoredMedia("test.jpg")
    ).resolves.toEqual({
      contentType: "image/jpeg",
      mediaType: "IMAGE"
    });
  });

  it("detects PDF", async () => {
    vi.spyOn(storage, "readStoragePrefix").mockResolvedValue(
      Buffer.from("%PDF-1.7")
    );

    await expect(
      inspectStoredMedia("test.pdf")
    ).resolves.toEqual({
      contentType: "application/pdf",
      mediaType: "DOCUMENT"
    });
  });

  it("falls back to binary", async () => {
    vi.spyOn(storage, "readStoragePrefix").mockResolvedValue(
      Buffer.from([0x00, 0x01, 0x02])
    );

    await expect(
      inspectStoredMedia("unknown.bin")
    ).resolves.toEqual({
      contentType: "application/octet-stream",
      mediaType: "OTHER"
    });
  });
});

describe("declaredTypeMatchesDetectedType", () => {
  it("accepts matching image types", () => {
    expect(
      declaredTypeMatchesDetectedType("image/png", {
        contentType: "image/jpeg",
        mediaType: "IMAGE"
      })
    ).toBe(true);
  });

  it("rejects a declared image containing PDF data", () => {
    expect(
      declaredTypeMatchesDetectedType("image/png", {
        contentType: "application/pdf",
        mediaType: "DOCUMENT"
      })
    ).toBe(false);
  });
});
