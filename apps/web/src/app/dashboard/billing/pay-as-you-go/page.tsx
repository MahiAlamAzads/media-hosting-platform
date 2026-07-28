"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import {
  formatMetricValue,
  formatMoneyMinor,
  metricLabels,
  type UsageMetricName
} from "@/lib/billing-format";

type Currency = "BDT" | "USD";
type WalletTransaction = {
  id: string;
  kind: string;
  amountMinor: string;
  balanceAfterMinor: string;
  reference: string | null;
  createdAt: string;
  invoice: { id: string; number: string; status: string } | null;
};
type Wallet = {
  id: string;
  currency: Currency;
  status: "ACTIVE" | "FROZEN" | "CLOSED";
  balanceMinor: string;
  reservedMinor: string;
  availableMinor: string;
  lowBalanceThresholdMinor: string;
  transactions?: WalletTransaction[];
};
type PaygMetric = {
  metric: UsageMetricName;
  overageUnit: string | null;
  overagePriceMinor: string | null;
  selectable: boolean;
};
type RevenueOptions = {
  current: {
    revenueModel: "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";
    subscriptionTerm: string;
    currency: Currency;
    planCode: string;
    planName: string;
  };
  minimumTopupMinor: string;
  wallet: Wallet | null;
  paygMetrics: PaygMetric[];
  paygPolicy: null | {
    status: string;
    currency: Currency;
    metrics: Array<{
      metric: UsageMetricName;
      enabled: boolean;
      metricSpendCapMinor: string | null;
    }>;
  };
};

function majorToMinor(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0";
  return String(Math.round(numeric * 100));
}

function unitLabel(metric: UsageMetricName, unit: string | null): string {
  if (!unit) return "unit";
  return formatMetricValue(metric, unit);
}

export default function PrepaidPaygPage() {
  const [options, setOptions] = useState<RevenueOptions | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [topup, setTopup] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] =
    useState<"success" | "danger" | "warning">("success");

  async function load(): Promise<void> {
    const [optionResponse, walletResponse] = await Promise.all([
      apiRequest<{ data: RevenueOptions }>("/api/v1/billing/revenue-options"),
      apiRequest<{ data: Wallet | null }>("/api/v1/billing/wallet")
    ]);
    setOptions(optionResponse.data);
    setWallet(walletResponse.data);
    const state: Record<string, boolean> = {};
    const saved = new Map(
      (optionResponse.data.paygPolicy?.metrics ?? []).map(item => [
        item.metric,
        item
      ])
    );
    const savedCaps: Record<string, string> = {};
    optionResponse.data.paygMetrics.forEach(item => {
      if (!item.selectable) return;
      const setting = saved.get(item.metric);
      state[item.metric] = setting
        ? setting.enabled
        : optionResponse.data.current.revenueModel !== "PREPAID_PAYG";
      if (setting?.metricSpendCapMinor) {
        savedCaps[item.metric] = (
          Number(setting.metricSpendCapMinor) / 100
        ).toFixed(2);
      }
    });
    setSelected(state);
    setCaps(savedCaps);
    setTopup(
      (Number(optionResponse.data.minimumTopupMinor) / 100).toFixed(2)
    );
  }

  useEffect(() => {
    void load().catch(error => {
      setVariant("danger");
      setMessage((error as Error).message);
    });
  }, []);

  const selectableMetrics = useMemo(
    () => options?.paygMetrics.filter(item => item.selectable) ?? [],
    [options]
  );

  const available = wallet
    ? BigInt(wallet.availableMinor)
    : BigInt(0);
  const minimum = options
    ? BigInt(options.minimumTopupMinor)
    : BigInt(0);
  const canActivate =
    Boolean(wallet) &&
    wallet?.status === "ACTIVE" &&
    available >= minimum &&
    Object.values(selected).some(Boolean);

  async function createTopup(): Promise<void> {
    if (!options) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiRequest<{
        data: { invoiceId: string };
      }>("/api/v1/billing/wallet/topups", {
        method: "POST",
        body: JSON.stringify({
          currency: options.current.currency,
          amountMinor: majorToMinor(topup)
        })
      });
      window.location.assign(
        `/dashboard/billing/payments/${response.data.invoiceId}`
      );
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
      setBusy(false);
    }
  }

  async function activate(): Promise<void> {
    if (!options) return;
    const metrics = selectableMetrics
      .filter(item => selected[item.metric])
      .map(item => ({
        metric: item.metric,
        metricSpendCapMinor: caps[item.metric]
          ? majorToMinor(caps[item.metric])
          : null
      }));

    if (metrics.length === 0) {
      setVariant("warning");
      setMessage("Select at least one metered service.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/api/v1/billing/revenue-model", {
        method: "PATCH",
        body: JSON.stringify({
          revenueModel: "PREPAID_PAYG",
          currency: options.current.currency,
          metrics
        })
      });
      await load();
      setVariant("success");
      setMessage(
        "Prepaid Pay As You Go is active. Usage will now debit the wallet."
      );
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function switchToSubscription(): Promise<void> {
    setBusy(true);
    try {
      await apiRequest("/api/v1/billing/revenue-model", {
        method: "PATCH",
        body: JSON.stringify({ revenueModel: "SUBSCRIPTION" })
      });
      window.location.assign("/dashboard/billing/plans");
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
      setBusy(false);
    }
  }

  if (!options) {
    return <LoadingBlock label="Loading prepaid wallet…" />;
  }

  return (
    <>
      <PageHeader
        title="Prepaid Pay As You Go"
        subtitle="Top up first, then choose exactly which metered services may consume wallet credit."
      >
        <a
          className="btn btn-outline-secondary"
          href="/dashboard/billing/revenue-model"
        >
          Revenue options
        </a>
      </PageHeader>

      <Feedback message={message} variant={variant} />

      <div className="alert alert-info">
        <strong>No credit, no PAYG service.</strong> Your wallet must contain at
        least {formatMoneyMinor(options.minimumTopupMinor, options.current.currency)}
        before activation. Card numbers and CVV are never stored by this platform.
      </div>

      <div className="row g-4">
        <div className="col-xl-4">
          <div className="card h-100">
            <div className="card-header"><strong>Wallet</strong></div>
            <div className="card-body">
              <div className="display-6 fw-semibold mb-1">
                {formatMoneyMinor(wallet?.availableMinor ?? "0", options.current.currency)}
              </div>
              <div className="text-secondary small mb-4">Available balance</div>

              <dl className="row small mb-4">
                <dt className="col-6">Status</dt>
                <dd className="col-6 text-end">{wallet?.status ?? "Not funded"}</dd>
                <dt className="col-6">Total balance</dt>
                <dd className="col-6 text-end">
                  {formatMoneyMinor(wallet?.balanceMinor ?? "0", options.current.currency)}
                </dd>
                <dt className="col-6">Reserved</dt>
                <dd className="col-6 text-end">
                  {formatMoneyMinor(wallet?.reservedMinor ?? "0", options.current.currency)}
                </dd>
              </dl>

              <label className="form-label">Top-up amount ({options.current.currency})</label>
              <div className="input-group">
                <span className="input-group-text">
                  {options.current.currency === "BDT" ? "৳" : "$"}
                </span>
                <input
                  className="form-control"
                  inputMode="decimal"
                  value={topup}
                  onChange={event => setTopup(event.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={createTopup}
                >
                  Create top-up invoice
                </button>
              </div>
              <div className="form-text">
                Pay the invoice through Manual Payment or SSLCOMMERZ. Balance is
                credited only after payment approval/validation.
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Selected PAYG services</strong>
              <span className={`badge ${
                options.current.revenueModel === "PREPAID_PAYG"
                  ? "text-bg-success"
                  : "text-bg-secondary"
              }`}>
                {options.current.revenueModel === "PREPAID_PAYG"
                  ? "Active"
                  : "Not active"}
              </span>
            </div>
            <div className="card-body">
              <p className="text-secondary">
                PAYG starts charging from the first billable unit. Only selected
                metered services are enabled; unselected PAYG services remain stopped.
              </p>

              <div className="vstack gap-3">
                {selectableMetrics.map(item => (
                  <div className="border rounded p-3" key={item.metric}>
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={Boolean(selected[item.metric])}
                        onChange={event =>
                          setSelected(current => ({
                            ...current,
                            [item.metric]: event.target.checked
                          }))
                        }
                        id={`metric-${item.metric}`}
                      />
                      <label
                        className="form-check-label fw-semibold"
                        htmlFor={`metric-${item.metric}`}
                      >
                        {metricLabels[item.metric]}
                      </label>
                    </div>
                    <div className="small text-secondary mt-2">
                      {formatMoneyMinor(
                        item.overagePriceMinor ?? "0",
                        options.current.currency
                      )} per {unitLabel(item.metric, item.overageUnit)}
                    </div>
                    {selected[item.metric] && (
                      <div className="mt-3">
                        <label className="form-label small">
                          Optional maximum spend for this service
                        </label>
                        <input
                          className="form-control form-control-sm"
                          inputMode="decimal"
                          placeholder="No separate cap"
                          value={caps[item.metric] ?? ""}
                          onChange={event =>
                            setCaps(current => ({
                              ...current,
                              [item.metric]: event.target.value
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectableMetrics.length === 0 && (
                <div className="alert alert-warning mb-0">
                  The current plan does not have PAYG unit prices. An administrator
                  must configure overage prices first.
                </div>
              )}
            </div>
            <div className="card-footer d-flex flex-wrap justify-content-between gap-2">
              <button
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={switchToSubscription}
              >
                Use subscription instead
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !canActivate}
                onClick={activate}
              >
                {busy ? "Saving…" : "Activate prepaid PAYG"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><strong>Recent wallet activity</strong></div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th className="text-end">Amount</th>
                <th className="text-end">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {(wallet?.transactions ?? []).map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td><span className="badge text-bg-light">{item.kind}</span></td>
                  <td>{item.invoice?.number ?? item.reference ?? "—"}</td>
                  <td className={`text-end ${
                    BigInt(item.amountMinor) >= BigInt(0) ? "text-success" : "text-danger"
                  }`}>
                    {formatMoneyMinor(item.amountMinor, wallet!.currency)}
                  </td>
                  <td className="text-end">
                    {formatMoneyMinor(item.balanceAfterMinor, wallet!.currency)}
                  </td>
                </tr>
              ))}
              {!wallet?.transactions?.length && (
                <tr><td colSpan={5} className="text-center text-secondary py-4">
                  No wallet transactions yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
