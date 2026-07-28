import { env } from "../config/env.js";
import { redisKey, redisReady, withRedis } from "./redis.js";

type LocalEntry = {
  value: string;
  expiresAt: number;
};

const localCache = new Map<string, LocalEntry>();
const inFlight = new Map<string, Promise<unknown>>();

const stats = {
  redisHits: 0,
  localHits: 0,
  misses: 0,
  writes: 0,
  deletes: 0,
  errors: 0,
  singleFlightJoins: 0
};

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint"
      ? { __mediaPlatformBigInt: item.toString() }
      : item
  );
}

function decode<T>(value: string): T {
  return JSON.parse(value, (_key, item) => {
    if (
      item &&
      typeof item === "object" &&
      typeof item.__mediaPlatformBigInt === "string"
    ) {
      return BigInt(item.__mediaPlatformBigInt);
    }
    return item;
  }) as T;
}

function pruneLocalCache(now = Date.now()): void {
  for (const [key, entry] of localCache) {
    if (entry.expiresAt <= now) {
      localCache.delete(key);
    }
  }

  while (localCache.size > env.REDIS_LOCAL_CACHE_MAX_ENTRIES) {
    const firstKey = localCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    localCache.delete(firstKey);
  }
}

function setLocal(key: string, value: string, ttlSeconds: number): void {
  pruneLocalCache();
  localCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
}

function getLocal(key: string): string | undefined {
  const entry = localCache.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    localCache.delete(key);
    return undefined;
  }

  return entry.value;
}

export async function cacheGet<T>(namespace: string, id: string): Promise<T | undefined> {
  const key = redisKey("cache", namespace, id);

  const redisValue = await withRedis(redis => redis.get(key));
  if (typeof redisValue === "string") {
    stats.redisHits += 1;
    try {
      return decode<T>(redisValue);
    } catch {
      stats.errors += 1;
      await withRedis(redis => redis.del(key));
    }
  }

  if (!redisReady()) {
    const localValue = getLocal(key);
    if (localValue !== undefined) {
      stats.localHits += 1;
      try {
        return decode<T>(localValue);
      } catch {
        stats.errors += 1;
        localCache.delete(key);
      }
    }
  }

  stats.misses += 1;
  return undefined;
}

export async function cacheSet(
  namespace: string,
  id: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const key = redisKey("cache", namespace, id);
  const encoded = encode(value);
  stats.writes += 1;

  const redisResult = await withRedis(redis =>
    redis.set(key, encoded, { EX: ttlSeconds })
  );

  if (redisResult === undefined) {
    const fallbackTtl = Math.min(
      ttlSeconds,
      env.REDIS_LOCAL_CACHE_FALLBACK_TTL_SECONDS
    );
    setLocal(key, encoded, fallbackTtl);
  } else {
    localCache.delete(key);
  }
}

export async function cacheDelete(
  namespace: string,
  ...ids: string[]
): Promise<void> {
  if (ids.length === 0) return;

  const keys = ids.map(id => redisKey("cache", namespace, id));
  stats.deletes += keys.length;
  keys.forEach(key => localCache.delete(key));

  await withRedis(redis => redis.del(keys));
}

export async function cacheGetOrSet<T>(
  namespace: string,
  id: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(namespace, id);
  if (cached !== undefined) return cached;

  const flightKey = `${namespace}:${id}`;
  const existing = inFlight.get(flightKey) as Promise<T> | undefined;
  if (existing) {
    stats.singleFlightJoins += 1;
    return existing;
  }

  const promise = loader()
    .then(async value => {
      await cacheSet(namespace, id, value, ttlSeconds);
      return value;
    })
    .finally(() => {
      inFlight.delete(flightKey);
    });

  inFlight.set(flightKey, promise);
  return promise;
}

export async function shouldRunThrottled(
  namespace: string,
  id: string,
  ttlSeconds: number
): Promise<boolean> {
  const key = redisKey("throttle", namespace, id);
  const result = await withRedis(redis =>
    redis.set(key, "1", { EX: ttlSeconds, NX: true })
  );

  if (result !== undefined) {
    return result === "OK";
  }

  if (getLocal(key) !== undefined) return false;
  setLocal(key, "1", ttlSeconds);
  return true;
}

export function getCacheStats() {
  pruneLocalCache();
  return {
    ...stats,
    localEntries: localCache.size,
    inFlightLoads: inFlight.size
  };
}

export function resetCacheStatsForTests(): void {
  localCache.clear();
  inFlight.clear();
  Object.keys(stats).forEach(key => {
    stats[key as keyof typeof stats] = 0;
  });
}
