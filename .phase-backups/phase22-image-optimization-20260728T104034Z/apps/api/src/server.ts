import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeRedis, connectRedis, getRedisHealth } from "./infrastructure/redis.js";

let server: ReturnType<typeof app.listen> | null = null;
let shuttingDown = false;

async function start(): Promise<void> {
  await connectRedis().catch(() => {
    console.error(
      "Initial Redis connection failed. Readiness will remain unavailable until Redis reconnects."
    );
  });

  server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
    console.log(`Redis status: ${getRedisHealth().status}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received; closing services.`);

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await closeRedis();
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
});

process.on("SIGINT", () => {
  void shutdown("SIGINT")
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
});

void start().catch(error => {
  console.error("API startup failed:", error);
  process.exit(1);
});
