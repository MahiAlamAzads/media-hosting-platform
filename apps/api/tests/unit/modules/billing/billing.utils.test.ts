import { describe, expect, it } from "vitest";
import {
  calculateUsagePercent,
  formatMoneyMinor,
  getPeriodBounds,
  getSubscriptionCommitmentBounds,
  projectUsage,
  subscriptionTermToInterval,
  usageState,
} from "../../../../src/modules/billing/billing.utils.js";

describe("Phase 8 billing utilities", () => {
  it("formats BDT and USD from integer minor units", () => {
    expect(formatMoneyMinor(99_000n, "BDT")).toBe("৳990");
    expect(formatMoneyMinor(900n, "USD")).toBe("$9");
    expect(formatMoneyMinor(925n, "USD")).toBe("$9.25");
    expect(formatMoneyMinor(-125n, "BDT")).toBe("-৳1.25");
  });

  it("creates anchored monthly and yearly billing periods", () => {
    const now = new Date("2026-07-27T12:30:00.000Z");
    expect(getPeriodBounds(now, "MONTHLY")).toEqual({
      start: new Date("2026-07-27T12:30:00.000Z"),
      end: new Date("2026-08-27T12:30:00.000Z"),
    });
    expect(getPeriodBounds(now, "YEARLY")).toEqual({
      start: new Date("2026-07-27T12:30:00.000Z"),
      end: new Date("2027-07-27T12:30:00.000Z"),
    });

    expect(
      getPeriodBounds(new Date("2026-01-31T12:30:00.000Z"), "MONTHLY").end,
    ).toEqual(new Date("2026-02-28T12:30:00.000Z"));

    expect(
      getPeriodBounds(new Date("2028-02-29T12:30:00.000Z"), "YEARLY").end,
    ).toEqual(new Date("2029-02-28T12:30:00.000Z"));
  });

  it("creates fixed 3, 6 and 12 month subscription commitments", () => {
    expect(
      getSubscriptionCommitmentBounds(
        new Date("2026-01-31T10:00:00.000Z"),
        "THREE_MONTHS",
      ).end,
    ).toEqual(new Date("2026-04-30T10:00:00.000Z"));

    expect(
      getSubscriptionCommitmentBounds(
        new Date("2026-08-31T10:00:00.000Z"),
        "SIX_MONTHS",
      ).end,
    ).toEqual(new Date("2027-02-28T10:00:00.000Z"));

    expect(
      getSubscriptionCommitmentBounds(
        new Date("2028-02-29T10:00:00.000Z"),
        "ONE_YEAR",
      ).end,
    ).toEqual(new Date("2029-02-28T10:00:00.000Z"));

    expect(subscriptionTermToInterval("THREE_MONTHS")).toBe("MONTHLY");
    expect(subscriptionTermToInterval("SIX_MONTHS")).toBe("MONTHLY");
    expect(subscriptionTermToInterval("ONE_YEAR")).toBe("YEARLY");
  });

  it("calculates threshold states without floating point money", () => {
    expect(calculateUsagePercent(700n, 1_000n)).toBe(70);
    expect(usageState(69.99)).toBe("OK");
    expect(usageState(70)).toBe("NOTICE");
    expect(usageState(80)).toBe("WARNING");
    expect(usageState(90)).toBe("CRITICAL");
    expect(usageState(100)).toBe("EXCEEDED");
  });

  it("projects usage from elapsed billing time", () => {
    const start = new Date("2026-07-01T00:00:00.000Z");
    const end = new Date("2026-07-31T00:00:00.000Z");
    const halfway = new Date("2026-07-16T00:00:00.000Z");
    expect(projectUsage(500n, start, end, halfway)).toBe(1_000n);
  });
});
