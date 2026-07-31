"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  formatMetricValue,
  metricLabels,
  usageAlertClass,
  formatMoneyMinor,
  type UsageMetricName,
} from "@/lib/billing-format";

type UsageWarning = {
  metric: UsageMetricName;
  current: string;
  limit: string;
  percent: number;
  threshold: 70 | 80 | 90 | 100 | null;
  blocked: boolean;
  paygEnabled: boolean;
  warningMessage: string | null;
};

type WalletSummary = {
  currency: "BDT" | "USD";
  status: "ACTIVE" | "FROZEN" | "CLOSED";
  balanceMinor: string;
  reservedMinor: string;
  availableMinor: string;
  lowBalanceThresholdMinor: string;
};

type UsageResponse = {
  data: {
    subscription: {
      periodEnd: string;
      revenueModel: "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";
    };
    payg: {
      operational: boolean;
      wallet: WalletSummary | null;
    };
    metrics: UsageWarning[];
  };
};

export function UsageWarningBanner() {
  const [metrics, setMetrics] = useState<UsageWarning[]>([]);
  const [periodEnd, setPeriodEnd] = useState("");
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [prepaidMode, setPrepaidMode] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await apiRequest<UsageResponse>(
          "/api/v1/billing/usage",
        );

        if (!active) return;

        setMetrics(
          response.data.metrics
            .filter(
              (metric) => metric.threshold !== null && !metric.paygEnabled,
            )
            .sort((left, right) => right.percent - left.percent),
        );
        setPeriodEnd(response.data.subscription.periodEnd);
        setWallet(response.data.payg.wallet);
        setPrepaidMode(
          response.data.subscription.revenueModel === "PREPAID_PAYG",
        );
      } catch {
        // Billing may be temporarily unavailable while the account loads.
      }
    }

    void load();
    const timer = window.setInterval(load, 60_000);

    function onVisible(): void {
      if (document.visibilityState === "visible") {
        void load();
      }
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const highest = metrics[0];
  const remaining = useMemo(
    () => Math.max(0, metrics.length - 1),
    [metrics.length],
  );

  const availableMinor = wallet ? BigInt(wallet.availableMinor) : BigInt(0);
  const lowBalanceMinor = wallet
    ? BigInt(wallet.lowBalanceThresholdMinor)
    : BigInt(0);
  const walletUnavailable =
    prepaidMode &&
    (!wallet || wallet.status !== "ACTIVE" || availableMinor <= BigInt(0));
  const walletLow =
    prepaidMode &&
    Boolean(wallet) &&
    wallet?.status === "ACTIVE" &&
    availableMinor > BigInt(0) &&
    availableMinor <= lowBalanceMinor;

  if (walletUnavailable || walletLow) {
    const currency = wallet?.currency ?? "BDT";
    const available = wallet?.availableMinor ?? "0";

    return (
      <div
        className={`alert ${walletUnavailable ? "alert-danger" : "alert-warning"} border-0 shadow-sm mb-4`}
        role="alert"
      >
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div className="d-flex gap-3">
            <i
              className={`bi ${walletUnavailable ? "bi-wallet2" : "bi-exclamation-triangle-fill"} fs-4`}
            />
            <div>
              <div className="fw-semibold">
                {walletUnavailable
                  ? "Prepaid PAYG is stopped"
                  : "Prepaid wallet balance is low"}
              </div>
              <div className="small mt-1">
                {walletUnavailable
                  ? "Top up the wallet to resume selected metered services."
                  : "Top up now to prevent selected PAYG services from stopping."}
              </div>
              <div className="small mt-2">
                Available balance: {formatMoneyMinor(available, currency)}
                {walletLow && wallet && (
                  <>
                    {" "}
                    · Low-balance threshold:{" "}
                    {formatMoneyMinor(
                      wallet.lowBalanceThresholdMinor,
                      wallet.currency,
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <a
            className="btn btn-sm btn-dark"
            href="/dashboard/billing/pay-as-you-go"
          >
            Top up wallet
          </a>
        </div>
      </div>
    );
  }

  if (!highest || highest.threshold === null) return null;

  return (
    <div
      className={`alert ${usageAlertClass(highest.percent)} border-0 shadow-sm mb-4`}
      role="alert"
    >
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div className="d-flex gap-3">
          <i
            className={`bi ${
              highest.blocked
                ? "bi-slash-circle-fill"
                : highest.percent >= 90
                  ? "bi-exclamation-octagon-fill"
                  : "bi-exclamation-triangle-fill"
            } fs-4`}
          />
          <div>
            <div className="fw-semibold">
              {highest.blocked
                ? `${metricLabels[highest.metric]} stopped at 100%`
                : highest.paygEnabled && highest.threshold === 100
                  ? `${metricLabels[highest.metric]} PAYG is active`
                  : `${metricLabels[highest.metric]} reached ${highest.threshold}%`}
            </div>
            <div className="small mt-1">{highest.warningMessage}</div>
            <div className="small mt-2">
              {formatMetricValue(highest.metric, highest.current)} of{" "}
              {formatMetricValue(highest.metric, highest.limit)} used.
              {periodEnd && (
                <>
                  {" "}
                  Current period ends {new Date(periodEnd).toLocaleDateString()}
                  .
                </>
              )}
            </div>
            {remaining > 0 && (
              <div className="small mt-1">
                {remaining} additional usage meter
                {remaining == 1 ? "" : "s"} also require attention.
              </div>
            )}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <a
            className="btn btn-sm btn-light border"
            href="/dashboard/billing/usage"
          >
            Review usage
          </a>
          {highest.paygEnabled && (
            <a
              className="btn btn-sm btn-dark"
              href="/dashboard/billing/pay-as-you-go"
            >
              Review PAYG
            </a>
          )}
          <a
            className={`btn btn-sm ${highest.paygEnabled ? "btn-light border" : "btn-dark"}`}
            href="/dashboard/billing/plans"
          >
            Compare plans
          </a>
        </div>
      </div>
    </div>
  );
}
