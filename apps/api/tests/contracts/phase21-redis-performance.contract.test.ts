import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 21 Redis performance contracts", () => {
  it("uses the official Redis client and connection URL", () => {
    const packageJson = source("package.json");
    const redis = source("src/infrastructure/redis.ts");

    expect(packageJson).toContain('"@redis/client": "^6.1.0"');
    expect(redis).toContain("url: env.REDIS_URL");
    expect(redis).toContain('client.on("error"');
    expect(redis).not.toContain("REDIS_URL}");
    expect(redis).toContain("safeRedisError");
  });

  it("keeps Redis optional with safe local fallbacks", () => {
    const redis = source("src/infrastructure/redis.ts");
    const cache = source("src/infrastructure/cache.ts");
    const rateStore = source("src/infrastructure/redis-rate-limit-store.ts");

    expect(redis).toContain("if (!env.REDIS_URL) return null");
    expect(cache).toContain("REDIS_LOCAL_CACHE_FALLBACK_TTL_SECONDS");
    expect(rateStore).toContain("MemoryStore");
    expect(rateStore).toContain("implements Store");
  });

  it("shares rate limits and throttles authentication touch writes", () => {
    const app = source("src/app.ts");
    const auth = source("src/middleware/authenticate.ts");

    expect(app).toContain('new RedisRateLimitStore("standard")');
    expect(app).toContain('new RedisRateLimitStore("public-media")');
    expect(auth).toContain('"api-key-touch"');
    expect(auth).toContain('"session-touch"');
    expect(auth).not.toContain("cacheGet(");
  });

  it("caches public descriptors and invalidates mutations", () => {
    const publicRoute = source("src/modules/public/public-media.legacy.ts");
    const media = source("src/modules/media/media.legacy.ts");
    const uploads = source("src/modules/uploads/uploads.legacy.ts");
    const processor = source("src/modules/processing/image-processor.ts");

    expect(publicRoute).toContain('"public-media"');
    expect(media).toContain("invalidatePublicMediaCache");
    expect(uploads).toContain("invalidatePublicMediaCache(mediaAsset.id)");
    expect(processor).toContain("invalidatePublicMediaCache(asset.id)");
  });

  it("deduplicates burst usage-alert scheduling across instances", () => {
    const alerts = source("src/modules/billing/usage-alert.service.ts");

    expect(alerts).toContain('"usage-alert-evaluation"');
    expect(alerts).toContain("REDIS_USAGE_ALERT_DEBOUNCE_SECONDS");
  });

  it("protects readiness and keeps public health details sanitized", () => {
    const app = source("src/app.ts");
    const server = source("src/server.ts");

    expect(app).toContain('app.get("/health/redis"');
    expect(app).toContain("redis.required && !redis.isReady");

    const readinessBlock = app.slice(
      app.indexOf('app.get("/health/ready"'),
      app.indexOf('app.get("/health/redis"')
    );
    expect(readinessBlock).not.toContain("dependencies");
    expect(readinessBlock).toContain(
      'status: ready ? "ready" : "not_ready"'
    );

    const healthBlock = app.slice(
      app.indexOf('app.get("/health/redis"'),
      app.indexOf('app.get("/health/storage"')
    );
    expect(healthBlock).not.toContain("lastError");
    expect(server).toContain("Initial Redis connection failed.");
    expect(server).toContain("closeRedis");
  });
});
