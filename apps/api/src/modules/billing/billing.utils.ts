import type {
  BillingCurrencyName,
  BillingIntervalName,
  SubscriptionTermName,
} from "./billing.types.js";

export function formatMoneyMinor(
  amountMinor: bigint,
  currency: BillingCurrencyName,
): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  const symbol = currency === "BDT" ? "৳" : "$";
  const sign = negative ? "-" : "";
  const formattedWhole = new Intl.NumberFormat("en-US").format(whole);

  return fraction === 0n
    ? `${sign}${symbol}${formattedWhole}`
    : `${sign}${symbol}${formattedWhole}.${fraction.toString().padStart(2, "0")}`;
}

export function getPeriodBounds(
  startsAt: Date,
  interval: BillingIntervalName,
): { start: Date; end: Date } {
  const start = new Date(startsAt);
  start.setUTCMilliseconds(0);

  const end = new Date(start);
  const anchorDay = start.getUTCDate();

  // Move through the first day of the target month/year, then clamp the
  // original billing day to that target's last valid day. This prevents a
  // January 31 monthly subscription from rolling into March.
  end.setUTCDate(1);

  if (interval === "YEARLY") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  const targetYear = end.getUTCFullYear();
  const targetMonth = end.getUTCMonth();
  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  end.setUTCDate(Math.min(anchorDay, lastTargetDay));

  return { start, end };
}

export function subscriptionTermToInterval(
  term: SubscriptionTermName,
): BillingIntervalName {
  return term === "ONE_YEAR" ? "YEARLY" : "MONTHLY";
}

export function getSubscriptionCommitmentBounds(
  startsAt: Date,
  term: SubscriptionTermName,
): { start: Date; end: Date } {
  const start = new Date(startsAt);
  start.setUTCMilliseconds(0);

  if (term === "FREE") {
    return {
      start,
      end: new Date(Date.UTC(9999, 11, 31, 23, 59, 59)),
    };
  }

  if (term === "ENTERPRISE_CUSTOM") {
    throw new Error(
      "Enterprise commitment dates must be set by a platform administrator.",
    );
  }

  const months = term === "THREE_MONTHS" ? 3 : term === "SIX_MONTHS" ? 6 : 12;

  const end = new Date(start);
  const anchorDay = start.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastTargetDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(anchorDay, lastTargetDay));

  return { start, end };
}

export function calculateUsagePercent(current: bigint, limit: bigint): number {
  if (limit <= 0n) return current > 0n ? 100 : 0;
  const basisPoints = (current * 10_000n) / limit;
  return Number(basisPoints) / 100;
}

export function projectUsage(
  current: bigint,
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): bigint {
  const total = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const elapsed = Math.max(
    1,
    Math.min(total, now.getTime() - periodStart.getTime()),
  );

  return (current * BigInt(total)) / BigInt(elapsed);
}

export { usageSeverity as usageState } from "./usage-alert-policy.js";
