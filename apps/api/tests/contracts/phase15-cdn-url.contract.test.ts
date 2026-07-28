import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(apiRoot, relativePath), "utf8");
}

describe("Phase 15 direct CDN URL contracts", () => {
  it("mounts the short public image module through the registry", () => {
    const app = read("src/app.ts");
    const registry = read("src/modules/module-registry.ts");
    const moduleSource = read(
      "src/modules/public/public-media.module.ts"
    );
    expect(app).toContain("for (const module of apiModules)");
    expect(registry).toContain("publicMediaModule");
    expect(moduleSource).toContain('mountPath:"/i"');
  });

  it("returns imgUrl fields from upload completion", () => {
    const uploads = read("src/modules/uploads/uploads.legacy.ts");
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
