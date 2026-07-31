import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import { shouldRunThrottled } from "../../infrastructure/cache.js";
import { AppError } from "../../shared/http.js";
import { ImageProcessor } from "./image-processor.js";

const processor = new ImageProcessor();
const queue: string[] = [];
const queued = new Set<string>();
const activeJobs = new Set<Promise<void>>();
const activeAssetIds = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let started = false;
let sweepRunning = false;

const stats = {
  enqueued: 0,
  processed: 0,
  failed: 0,
  deduplicated: 0,
  sweeps: 0,
  lastSweepAt: null as string | null,
  lastProcessedAt: null as string | null,
  lastError: null as string | null,
};

export type ImageOptimizationQueueStatus =
  "QUEUED" | "DISABLED" | "NOT_APPLICABLE";

type ImageOptimizationResponse = {
  status: ImageOptimizationQueueStatus;
  outputFormat: "webp" | "avif" | null;
  variants: Array<"THUMBNAIL" | "PREVIEW">;
};

export function imageOptimizationResponse(
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER",
  queuedForProcessing: boolean,
): ImageOptimizationResponse {
  const applicable = mediaType === "IMAGE";
  return {
    status: !applicable
      ? "NOT_APPLICABLE"
      : env.IMAGE_OPTIMIZATION_ENABLED && queuedForProcessing
        ? "QUEUED"
        : "DISABLED",
    outputFormat:
      applicable && env.IMAGE_OPTIMIZATION_ENABLED
        ? env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT
        : null,
    variants:
      applicable && env.IMAGE_OPTIMIZATION_ENABLED
        ? ["THUMBNAIL", "PREVIEW"]
        : [],
  };
}

export async function findPendingImageAssetIds(
  limit = env.IMAGE_OPTIMIZATION_BATCH_SIZE,
): Promise<string[]> {
  const assets = await prisma.mediaAsset.findMany({
    where: {
      detectedMediaType: "IMAGE",
      status: "READY",
      deletedAt: null,
      OR: [
        {
          variants: {
            none: {
              kind: "THUMBNAIL",
              status: "READY",
            },
          },
        },
        {
          variants: {
            none: {
              kind: "PREVIEW",
              status: "READY",
            },
          },
        },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });

  return assets.map((asset: { id: string }) => asset.id);
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

async function runAsset(assetId: string): Promise<void> {
  const allowed = await shouldRunThrottled(
    "image-optimization",
    assetId,
    env.IMAGE_OPTIMIZATION_LOCK_TTL_SECONDS,
  );

  if (!allowed) {
    stats.deduplicated += 1;
    return;
  }

  try {
    await processor.process(assetId);
    stats.processed += 1;
    stats.lastProcessedAt = new Date().toISOString();
    stats.lastError = null;
  } catch (error) {
    if (
      error instanceof AppError &&
      ["MEDIA_NOT_READY", "MEDIA_PROCESSING_CONFLICT"].includes(error.code)
    ) {
      stats.deduplicated += 1;
      return;
    }

    stats.failed += 1;
    stats.lastError = sanitizeError(error);
    console.error(`Automatic image optimization failed for ${assetId}:`, error);
  }
}

function drain(): void {
  if (!env.IMAGE_OPTIMIZATION_ENABLED) return;

  while (
    activeJobs.size < env.IMAGE_OPTIMIZATION_CONCURRENCY &&
    queue.length > 0
  ) {
    const assetId = queue.shift();
    if (!assetId) break;
    queued.delete(assetId);
    activeAssetIds.add(assetId);

    let job: Promise<void>;
    job = runAsset(assetId).finally(() => {
      activeJobs.delete(job);
      activeAssetIds.delete(assetId);
      drain();
    });

    activeJobs.add(job);
  }
}

export function enqueueImageOptimization(assetId: string): boolean {
  if (!env.IMAGE_OPTIMIZATION_ENABLED) return false;
  if (queued.has(assetId) || activeAssetIds.has(assetId)) return true;

  queued.add(assetId);
  queue.push(assetId);
  stats.enqueued += 1;
  queueMicrotask(drain);
  return true;
}

export async function sweepPendingImageOptimizations(): Promise<void> {
  if (!env.IMAGE_OPTIMIZATION_ENABLED || sweepRunning) return;
  sweepRunning = true;

  try {
    const assetIds = await findPendingImageAssetIds();
    assetIds.forEach(enqueueImageOptimization);
    stats.sweeps += 1;
    stats.lastSweepAt = new Date().toISOString();
  } catch (error) {
    stats.failed += 1;
    stats.lastError = sanitizeError(error);
    console.error("Automatic image optimization sweep failed:", error);
  } finally {
    sweepRunning = false;
  }
}

export function startImageOptimizationScheduler(): void {
  if (started || !env.IMAGE_OPTIMIZATION_ENABLED) return;
  started = true;

  void sweepPendingImageOptimizations();
  timer = setInterval(() => {
    void sweepPendingImageOptimizations();
  }, env.IMAGE_OPTIMIZATION_SWEEP_INTERVAL_MS);
  timer.unref();
}

export async function stopImageOptimizationScheduler(): Promise<void> {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await Promise.allSettled([...activeJobs]);
}

export function getImageOptimizationHealth() {
  return {
    enabled: env.IMAGE_OPTIMIZATION_ENABLED,
    started,
    outputFormat: env.IMAGE_OPTIMIZATION_OUTPUT_FORMAT,
    concurrency: env.IMAGE_OPTIMIZATION_CONCURRENCY,
    sweepIntervalMs: env.IMAGE_OPTIMIZATION_SWEEP_INTERVAL_MS,
    queued: queue.length,
    active: activeAssetIds.size,
    ...stats,
  };
}
