import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 22 automatic image optimization contracts", () => {
  it("queues image optimization after upload completion", () => {
    const uploads = source("src/modules/uploads/uploads.legacy.ts");
    expect(uploads).toContain("enqueueImageOptimization(mediaAsset.id)");
    expect(uploads).toContain("imageOptimizationResponse");
    expect(uploads).toContain("optimization,");
  });

  it("starts and stops the durable sweep scheduler", () => {
    const server = source("src/server.ts");
    const scheduler = source(
      "src/modules/processing/image-optimization-scheduler.ts",
    );
    expect(server).toContain("startImageOptimizationScheduler");
    expect(server).toContain("stopImageOptimizationScheduler");
    expect(scheduler).toContain("findPendingImageAssetIds");
    expect(scheduler).toContain('"image-optimization"');
    expect(scheduler).toContain("IMAGE_OPTIMIZATION_CONCURRENCY");
  });

  it("preserves originals and creates metadata-stripped optimized variants", () => {
    const processor = source("src/modules/processing/image-processor.ts");
    expect(processor).toContain("basePipeline.clone()");
    expect(processor).toContain("withoutEnlargement: true");
    expect(processor).toContain("fastShrinkOnLoad: true");
    expect(processor).toContain("IMAGE_OPTIMIZATION_OUTPUT_FORMAT");
    expect(processor).toContain("metadataStripped: true");
    expect(processor).not.toContain("overwriteStorageFile(asset.storageKey");
  });

  it("uses the optimized preview as public imgUrl while retaining original fileUrl", () => {
    const mediaUrl = source("src/shared/media-url.ts");
    expect(mediaUrl).toContain("optimizedImageUrl");
    expect(mediaUrl).toContain('absoluteUrl("PREVIEW")');
    expect(mediaUrl).toContain("fileUrl,");
    expect(mediaUrl).toContain("imgUrl: isImage ? optimizedImageUrl : null");
  });

  it("documents configuration and API response fields", () => {
    const env = source("src/config/env.ts");
    const openapi = JSON.parse(source("src/openapi/openapi.json"));
    expect(env).toContain("IMAGE_OPTIMIZATION_ENABLED");
    expect(env).toContain("IMAGE_PREVIEW_MAX_SIZE");
    expect(openapi.components.schemas.UploadCompleteResponse).toBeDefined();
    const data =
      openapi.components.schemas.UploadCompleteResponse.properties.data
        .allOf[1];
    expect(data.properties.optimization).toBeDefined();
  });
});
