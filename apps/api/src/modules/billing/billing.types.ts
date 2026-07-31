export const usageMetrics = [
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "UPLOAD_BYTES",
  "API_REQUESTS",
  "IMAGE_TRANSFORMATIONS",
  "VIDEO_PROCESSING_SECONDS",
  "PROCESSING_CPU_MILLISECONDS",
  "ACTIVE_ASSETS",
  "FOLDERS",
  "WORKSPACE_MEMBERS",
  "API_KEYS",
  "CONCURRENT_JOBS",
  "MAX_FILE_SIZE_BYTES",
] as const;

export type UsageMetricName = (typeof usageMetrics)[number];
export type BillingCurrencyName = "BDT" | "USD";
export type BillingIntervalName = "MONTHLY" | "YEARLY";
export type RevenueModelName =
  "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";
export type SubscriptionTermName =
  "FREE" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR" | "ENTERPRISE_CUSTOM";

export type EntitlementValue = {
  metric: UsageMetricName;
  includedAmount: bigint;
  hardLimit: boolean;
  overageAllowed: boolean;
  overageUnit: bigint | null;
  overageBdtMinor: bigint | null;
  overageUsdMinor: bigint | null;
};
