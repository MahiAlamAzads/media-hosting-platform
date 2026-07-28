import { createClient } from "@redis/client";
import { env } from "../config/env.js";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectionPromise: Promise<void> | null = null;
let lastError: string | null = null;
let connectedAt: Date | null = null;

const counters = {
  commands: 0,
  commandErrors: 0,
  reconnects: 0
};

function safeRedisError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/rediss?:\/\/[^@\s]+@/gi, match => {
      const protocol = match.toLowerCase().startsWith("rediss://")
        ? "rediss"
        : "redis";
      return `${protocol}://***@`;
    })
    .slice(0, 500);
}

export function redisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

export function redisKey(...parts: Array<string | number>): string {
  return [
    env.REDIS_KEY_PREFIX,
    ...parts.map(part => String(part).replace(/\s+/g, "-"))
  ].join(":");
}

function getOrCreateClient(): RedisClient | null {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy(retries) {
        counters.reconnects += 1;
        if (retries >= 6) {
          return new Error("Redis reconnect limit reached.");
        }
        return Math.min(250 * 2 ** retries, 5_000);
      }
    },
    disableOfflineQueue: true
  });

  client.on("error", error => {
    lastError = safeRedisError(error);
    counters.commandErrors += 1;
  });

  client.on("ready", () => {
    connectedAt = new Date();
    lastError = null;
  });

  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getOrCreateClient();
  if (!redis || redis.isReady) return;
  if (connectionPromise) return connectionPromise;

  const attempt = redis.connect()
    .then(() => undefined)
    .catch(error => {
      lastError = safeRedisError(error);
      if (env.REDIS_REQUIRED) throw error;
      console.warn("Redis is unavailable; using safe local fallbacks.");
    })
    .finally(() => {
      connectionPromise = null;
    });

  connectionPromise = attempt;

  if (env.REDIS_REQUIRED) {
    return attempt;
  }

  await Promise.race([
    attempt,
    new Promise<void>(resolve => {
      setTimeout(resolve, env.REDIS_CONNECT_TIMEOUT_MS + 250);
    })
  ]);
}

export async function closeRedis(): Promise<void> {
  if (!client) return;

  try {
    if (client.isOpen) {
      await client.close();
    }
  } finally {
    client = null;
    connectionPromise = null;
    connectedAt = null;
  }
}

export function redisReady(): boolean {
  return Boolean(client?.isReady);
}

export async function withRedis<T>(
  operation: (redis: RedisClient) => Promise<T>
): Promise<T | undefined> {
  const redis = getOrCreateClient();
  if (!redis) return undefined;

  if (!redis.isReady) {
    void connectRedis();
    return undefined;
  }

  try {
    counters.commands += 1;
    return await operation(redis);
  } catch (error) {
    counters.commandErrors += 1;
    lastError = safeRedisError(error);
    return undefined;
  }
}

export function getRedisHealth() {
  return {
    configured: redisConfigured(),
    required: env.REDIS_REQUIRED,
    status: !redisConfigured()
      ? "disabled"
      : redisReady()
        ? "ready"
        : "unavailable",
    isOpen: Boolean(client?.isOpen),
    isReady: Boolean(client?.isReady),
    connectedAt: connectedAt?.toISOString() ?? null,
    lastError,
    counters: { ...counters }
  };
}
