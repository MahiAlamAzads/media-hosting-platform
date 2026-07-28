import { describe, expect, it } from "vitest";
import {
  formatUsageMetricValue,
  highestUsageThreshold,
  nextUsageThreshold,
  usageAlertThresholds,
  usageSeverity,
  usageThresholdMessage
} from "../../../../src/modules/billing/usage-alert-policy.js";

describe("Phase 12 usage alert policy", () => {
  it("uses the exact 70, 80, 90 and 100 thresholds", () => {
    expect(usageAlertThresholds).toEqual([70, 80, 90, 100]);
    expect(highestUsageThreshold(69.99)).toBeNull();
    expect(highestUsageThreshold(70)).toBe(70);
    expect(highestUsageThreshold(80)).toBe(80);
    expect(highestUsageThreshold(90)).toBe(90);
    expect(highestUsageThreshold(100)).toBe(100);
  });

  it("returns the next threshold and severity", () => {
    expect(nextUsageThreshold(70)).toBe(80);
    expect(nextUsageThreshold(99.9)).toBe(100);
    expect(nextUsageThreshold(100)).toBeNull();
    expect(usageSeverity(70)).toBe("NOTICE");
    expect(usageSeverity(80)).toBe("WARNING");
    expect(usageSeverity(90)).toBe("CRITICAL");
    expect(usageSeverity(100)).toBe("EXCEEDED");
  });


  it("formats alert values for human-readable emails", () => {
    expect(
      formatUsageMetricValue("DELIVERY_BYTES", "1073741824")
    ).toBe("1.0 GB");
    expect(
      formatUsageMetricValue("VIDEO_PROCESSING_SECONDS", "90")
    ).toBe("1.5 min");
  });

  it("describes selected PAYG behavior at 100 percent", () => {
    expect(
      usageThresholdMessage({
        metric: "DELIVERY_BYTES",
        threshold: 100,
        blocked: false,
        paygEnabled: true
      })
    ).toContain("Pay as you go is active");
  });

  it("describes delivery hard-stop behavior at 100 percent", () => {
    expect(
      usageThresholdMessage({
        metric: "DELIVERY_BYTES",
        threshold: 100,
        blocked: true
      })
    ).toContain("Public CDN and signed delivery requests are blocked");
  });
});
