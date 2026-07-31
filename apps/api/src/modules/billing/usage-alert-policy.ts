import type { UsageMetricName } from "./billing.types.js";

export const usageAlertThresholds = [70, 80, 90, 100] as const;
export type UsageAlertThreshold = (typeof usageAlertThresholds)[number];

export type UsageSeverity =
  "OK" | "NOTICE" | "WARNING" | "CRITICAL" | "EXCEEDED";

const metricLabels: Record<UsageMetricName, string> = {
  STORAGE_BYTES: "Storage",
  DELIVERY_BYTES: "Delivery bandwidth",
  UPLOAD_BYTES: "Upload bandwidth",
  API_REQUESTS: "API requests",
  IMAGE_TRANSFORMATIONS: "Image transformations",
  VIDEO_PROCESSING_SECONDS: "Video processing",
  PROCESSING_CPU_MILLISECONDS: "Processing compute",
  ACTIVE_ASSETS: "Active assets",
  FOLDERS: "Folders",
  WORKSPACE_MEMBERS: "Workspace seats",
  API_KEYS: "API keys",
  CONCURRENT_JOBS: "Concurrent jobs",
  MAX_FILE_SIZE_BYTES: "Maximum file size",
};

const blockedMessages: Record<UsageMetricName, string> = {
  STORAGE_BYTES:
    "New uploads and generated variants are blocked until storage is freed or the plan is upgraded.",
  DELIVERY_BYTES:
    "Public CDN and signed delivery requests are blocked until the next billing period or a plan upgrade.",
  UPLOAD_BYTES:
    "New uploads are blocked until the next billing period or a plan upgrade.",
  API_REQUESTS:
    "Non-billing API requests are blocked until the next billing period or a plan upgrade.",
  IMAGE_TRANSFORMATIONS:
    "New image transformations are blocked until the next billing period or a plan upgrade.",
  VIDEO_PROCESSING_SECONDS:
    "New video processing is blocked until the next billing period or a plan upgrade.",
  PROCESSING_CPU_MILLISECONDS:
    "New media processing is blocked until the next billing period or a plan upgrade.",
  ACTIVE_ASSETS:
    "New assets and asset restores are blocked until assets are removed or the plan is upgraded.",
  FOLDERS:
    "New folders are blocked until folders are removed or the plan is upgraded.",
  WORKSPACE_MEMBERS:
    "New workspace members are blocked until a seat is freed or the plan is upgraded.",
  API_KEYS:
    "New API keys are blocked until a key is revoked or the plan is upgraded.",
  CONCURRENT_JOBS:
    "New processing jobs are blocked until an active job completes.",
  MAX_FILE_SIZE_BYTES: "Files larger than the plan limit are blocked.",
};

function formatRatio(
  value: bigint,
  divisor: bigint,
  suffix: string,
  decimals: 1 | 2,
): string {
  const scale = decimals === 1 ? 10n : 100n;
  const scaled = (value * scale) / divisor;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(decimals, "0");
  return `${whole}.${fraction} ${suffix}`;
}

export function formatUsageMetricValue(
  metric: UsageMetricName,
  rawValue: string,
): string {
  const value = BigInt(rawValue);

  if (
    metric === "STORAGE_BYTES" ||
    metric === "DELIVERY_BYTES" ||
    metric === "UPLOAD_BYTES" ||
    metric === "MAX_FILE_SIZE_BYTES"
  ) {
    const units: Array<[bigint, string]> = [
      [1_125_899_906_842_624n, "PB"],
      [1_099_511_627_776n, "TB"],
      [1_073_741_824n, "GB"],
      [1_048_576n, "MB"],
      [1_024n, "KB"],
    ];

    const unit = units.find(([divisor]) => value >= divisor);
    return unit ? formatRatio(value, unit[0], unit[1], 1) : `${value} B`;
  }

  if (metric === "VIDEO_PROCESSING_SECONDS") {
    return formatRatio(value, 60n, "min", 1);
  }

  if (metric === "PROCESSING_CPU_MILLISECONDS") {
    return formatRatio(value, 3_600_000n, "CPU hr", 2);
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export function highestUsageThreshold(
  percent: number,
): UsageAlertThreshold | null {
  if (percent >= 100) return 100;
  if (percent >= 90) return 90;
  if (percent >= 80) return 80;
  if (percent >= 70) return 70;
  return null;
}

export function nextUsageThreshold(
  percent: number,
): UsageAlertThreshold | null {
  return usageAlertThresholds.find((threshold) => percent < threshold) ?? null;
}

export function usageSeverity(percent: number): UsageSeverity {
  const threshold = highestUsageThreshold(percent);
  if (threshold === 100) return "EXCEEDED";
  if (threshold === 90) return "CRITICAL";
  if (threshold === 80) return "WARNING";
  if (threshold === 70) return "NOTICE";
  return "OK";
}

export function usageMetricLabel(metric: UsageMetricName): string {
  return metricLabels[metric];
}

export function usageThresholdMessage(input: {
  metric: UsageMetricName;
  threshold: UsageAlertThreshold;
  blocked: boolean;
  paygEnabled?: boolean;
}): string {
  const label = usageMetricLabel(input.metric);

  if (input.threshold === 100 && input.blocked) {
    return `${label} has reached 100% of the plan limit. ${blockedMessages[input.metric]}`;
  }

  if (input.threshold === 100 && input.paygEnabled) {
    return `${label} has reached 100% of the included plan limit. Pay as you go is active for this meter, so service continues within the configured spend caps while the saved payment method remains chargeable.`;
  }

  if (input.threshold === 100) {
    return `${label} has reached 100% of the plan limit. Overage remains available under the current billing policy.`;
  }

  if (input.threshold === 90) {
    return `${label} has reached 90% of the plan limit. Upgrade or reduce usage now to avoid interruption.`;
  }

  if (input.threshold === 80) {
    return `${label} has reached 80% of the plan limit. Review current usage and projected demand.`;
  }

  return `${label} has reached 70% of the plan limit. This is an early usage warning.`;
}
