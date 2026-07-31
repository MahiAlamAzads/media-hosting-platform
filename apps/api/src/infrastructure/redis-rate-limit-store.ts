import {
  MemoryStore,
  type IncrementResponse,
  type Options,
  type Store,
} from "express-rate-limit";
import { redisKey, withRedis } from "./redis.js";

const incrementScript = `
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if current == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

const decrementScript = `
local current = redis.call("DECR", KEYS[1])
if current <= 0 then
  redis.call("DEL", KEYS[1])
end
return current
`;

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private readonly fallback = new MemoryStore();
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisResult = await withRedis((redis) =>
      redis.eval(incrementScript, {
        keys: [redisKey("rate", this.prefix, key)],
        arguments: [String(this.windowMs)],
      }),
    );

    if (Array.isArray(redisResult)) {
      const totalHits = Number(redisResult[0]);
      const ttlMs = Math.max(Number(redisResult[1]), 1);
      return {
        totalHits,
        resetTime: new Date(Date.now() + ttlMs),
      };
    }

    return this.fallback.increment(key);
  }

  async decrement(key: string): Promise<void> {
    const redisResult = await withRedis((redis) =>
      redis.eval(decrementScript, {
        keys: [redisKey("rate", this.prefix, key)],
        arguments: [],
      }),
    );

    if (redisResult === undefined) {
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisResult = await withRedis((redis) =>
      redis.del(redisKey("rate", this.prefix, key)),
    );

    if (redisResult === undefined) {
      await this.fallback.resetKey(key);
    }
  }
}
