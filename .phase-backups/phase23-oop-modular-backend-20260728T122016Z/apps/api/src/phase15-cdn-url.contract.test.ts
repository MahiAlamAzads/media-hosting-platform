import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(apiRoot, relativePath), "utf8");
}

describe("Phase 15 direct CDN URL contracts", () => {
  it("mounts the short public image route", () => {
    const app = read("src/app.ts");
    expect(app).toContain('app.use("/i", publicMediaRouter)');
  });

  it("returns imgUrl fields from upload completion", () => {
    const uploads = read("src/modules/uploads/uploads.ts");
    expect(uploads).toContain("...urls");
    expect(uploads).toContain('visibility: mediaAsset.visibility');
  });

  it("documents the short CDN route and upload response", () => {
    const openapi = JSON.parse(read("src/openapi/openapi.json"));
    expect(openapi.paths["/i/{assetId}"].get).toBeDefined();
    expect(
      openapi.components.schemas.UploadCompleteResponse
    ).toBeDefined();
  });
});
