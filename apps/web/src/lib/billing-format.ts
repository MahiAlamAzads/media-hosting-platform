export type UsageMetricName =
  | "STORAGE_BYTES"
  | "DELIVERY_BYTES"
  | "UPLOAD_BYTES"
  | "API_REQUESTS"
  | "IMAGE_TRANSFORMATIONS"
  | "VIDEO_PROCESSING_SECONDS"
  | "PROCESSING_CPU_MILLISECONDS"
  | "ACTIVE_ASSETS"
  | "FOLDERS"
  | "WORKSPACE_MEMBERS"
  | "API_KEYS"
  | "CONCURRENT_JOBS"
  | "MAX_FILE_SIZE_BYTES";

export const metricLabels: Record<UsageMetricName, string> = {
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
  API_KEYS: "Active API keys",
  CONCURRENT_JOBS: "Concurrent jobs",
  MAX_FILE_SIZE_BYTES: "Maximum file size",
};

export function formatBytes(value: string | bigint): string {
  let amount = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(amount)) return "—";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let index = 0;

  while (Math.abs(amount) >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }

  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatMetricValue(
  metric: UsageMetricName,
  value: string,
): string {
  if (
    metric === "STORAGE_BYTES" ||
    metric === "DELIVERY_BYTES" ||
    metric === "UPLOAD_BYTES" ||
    metric === "MAX_FILE_SIZE_BYTES"
  ) {
    return formatBytes(value);
  }

  if (metric === "VIDEO_PROCESSING_SECONDS") {
    return `${(Number(value) / 60).toFixed(1)} min`;
  }

  if (metric === "PROCESSING_CPU_MILLISECONDS") {
    return `${(Number(value) / 3_600_000).toFixed(2)} CPU hr`;
  }

  return new Intl.NumberFormat("en-US").format(Number(value));
}

export function progressClass(percent: number): string {
  if (percent >= 90) return "bg-danger";
  if (percent >= 80) return "bg-warning";
  if (percent >= 70) return "bg-info";
  return "bg-primary";
}

export function usageAlertClass(percent: number): string {
  if (percent >= 90) return "alert-danger";
  if (percent >= 80) return "alert-warning";
  if (percent >= 70) return "alert-info";
  return "alert-secondary";
}

export function formatMoneyMinor(
  value: string | bigint,
  currency: "BDT" | "USD",
): string {
  const amount = typeof value === "bigint" ? value : BigInt(value || "0");
  const negative = amount < BigInt(0);
  const absolute = negative ? -amount : amount;
  const whole = absolute / BigInt(100);
  const fraction = absolute % BigInt(100);
  const symbol = currency === "BDT" ? "৳" : "$";
  const sign = negative ? "-" : "";
  const formatted = new Intl.NumberFormat("en-US").format(whole);
  return fraction === BigInt(0)
    ? `${sign}${symbol}${formatted}`
    : `${sign}${symbol}${formatted}.${fraction.toString().padStart(2, "0")}`;
}
