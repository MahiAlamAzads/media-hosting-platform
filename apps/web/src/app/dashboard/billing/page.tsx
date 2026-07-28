"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import {
  formatMetricValue,
  formatMoneyMinor,
  metricLabels,
  progressClass,
  type UsageMetricName
} from "@/lib/billing-format";

type Subscription = {
  status: string;
  currency: "BDT" | "USD";
  interval: "MONTHLY" | "YEARLY";
  revenueModel: "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";
  subscriptionTerm:
    | "FREE"
    | "THREE_MONTHS"
    | "SIX_MONTHS"
    | "ONE_YEAR"
    | "ENTERPRISE_CUSTOM";
  commitmentEndsAt: string | null;
  periodStart: string;
  periodEnd: string;
  plan: { code: string; name: string; version: number };
  pendingChange: null | {
    id: string;
    status: "PAYMENT_PENDING" | "PENDING" | "APPROVED";
    planName: string;
    currency: string;
    interval: string;
    createdAt: string;
    invoice: null | {
      id: string;
      number: string;
      status: string;
      amountMinor: string;
      currency: "BDT" | "USD";
      dueAt: string;
    };
  };
};

type Wallet = {
  currency: "BDT" | "USD";
  status: string;
  balanceMinor: string;
  reservedMinor: string;
  availableMinor: string;
};

type Metric = {
  metric: UsageMetricName;
  current: string;
  reserved: string;
  limit: string;
  percent: number;
  state: string;
  projected: string;
  projectedPercent: number;
  overage: { formatted: string };
};

type Usage = {
  plan: { code: string; name: string; version: number };
  subscription: {
    status: string;
    currency: "BDT" | "USD";
    interval: "MONTHLY" | "YEARLY";
    periodStart: string;
    periodEnd: string;
  };
  metrics: Metric[];
};

const summaryMetrics: UsageMetricName[] = [
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "API_REQUESTS",
  "IMAGE_TRANSFORMATIONS"
];

export default function BillingOverviewPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest<{ data: Subscription }>("/api/v1/billing/subscription"),
      apiRequest<{ data: Usage }>("/api/v1/billing/usage"),
      apiRequest<{ data: Wallet | null }>("/api/v1/billing/wallet")
    ])
      .then(([subscriptionResponse, usageResponse, walletResponse]) => {
        setSubscription(subscriptionResponse.data);
        setUsage(usageResponse.data);
        setWallet(walletResponse.data);
      })
      .catch(value => setError(value.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Billing overview"
        subtitle="Current plan, billing period, limits and projected usage."
      >
        <a className="btn btn-outline-primary" href="/dashboard/billing/revenue-model">
          Choose billing model
        </a>
        <a className="btn btn-primary" href={
          subscription?.revenueModel === "PREPAID_PAYG"
            ? "/dashboard/billing/pay-as-you-go"
            : "/dashboard/billing/plans"
        }>
          {subscription?.revenueModel === "PREPAID_PAYG" ? "Top up wallet" : "Compare plans"}
        </a>
      </PageHeader>

      <Feedback message={error} variant="danger" />

      {!subscription || !usage ? (
        <LoadingBlock label="Loading billing data…" />
      ) : (
        <>
          {subscription.pendingChange && (
            <div className="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-3">
              <div>
                <strong>Pending plan request:</strong>{" "}
                {subscription.pendingChange.planName} ·{" "}
                {subscription.pendingChange.currency} ·{" "}
                {subscription.pendingChange.interval.toLowerCase()}
              </div>
              {subscription.pendingChange.invoice && (
                <a
                  className="btn btn-warning btn-sm"
                  href={`/dashboard/billing/payments/${subscription.pendingChange.invoice.id}`}
                >
                  Complete payment
                </a>
              )}
            </div>
          )}

          <div className="row g-3 mb-4">
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-diagram-3"
                label="Revenue model"
                value={
                  subscription.revenueModel === "PREPAID_PAYG"
                    ? "Prepaid PAYG"
                    : subscription.revenueModel === "ENTERPRISE_CUSTOM"
                      ? "Enterprise"
                      : "Subscription"
                }
                hint={subscription.plan.name}
              />
            </div>
            <div className="col-sm-6 col-xl-3">
              {subscription.revenueModel === "PREPAID_PAYG" && wallet ? (
                <StatCard
                  icon="bi-wallet2"
                  label="Available wallet balance"
                  value={formatMoneyMinor(wallet.availableMinor, wallet.currency)}
                  hint={wallet.status}
                />
              ) : (
                <StatCard
                  icon="bi-calendar2-check"
                  label="Subscription term"
                  value={subscription.subscriptionTerm.replaceAll("_", " ")}
                  hint={subscription.currency}
                />
              )}
            </div>
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-calendar-range"
                label={subscription.commitmentEndsAt ? "Commitment ends" : "Usage period ends"}
                value={new Date(
                  subscription.commitmentEndsAt ?? subscription.periodEnd
                ).toLocaleDateString()}
                hint={subscription.status}
              />
            </div>
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-boxes"
                label="Plan"
                value={subscription.plan.name}
                hint={`Version ${subscription.plan.version}`}
              />
            </div>
          </div>

          {subscription.revenueModel === "PREPAID_PAYG" && (
            <div className="alert alert-primary d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <strong>Prepaid billing is active.</strong>{" "}
                Every selected PAYG operation is deducted from your wallet before it runs.
              </div>
              <a className="btn btn-primary btn-sm" href="/dashboard/billing/pay-as-you-go">
                Manage wallet and meters
              </a>
            </div>
          )}

          {subscription.revenueModel === "ENTERPRISE_CUSTOM" && (
            <div className="alert alert-dark d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <strong>Enterprise sales workflow is active.</strong>{" "}
                Your requirements are handled through a custom commercial agreement.
              </div>
              <a className="btn btn-light btn-sm" href="/dashboard/billing/enterprise">
                View inquiry
              </a>
            </div>
          )}

          <div className="card mb-4">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Priority usage meters</strong>
              <a className="small" href="/dashboard/billing/usage">
                View every limit
              </a>
            </div>
            <div className="card-body">
              <div className="row g-4">
                {summaryMetrics.map(metricName => {
                  const metric = usage.metrics.find(
                    item => item.metric === metricName
                  );
                  if (!metric) return null;

                  return (
                    <div className="col-md-6" key={metricName}>
                      <div className="d-flex justify-content-between gap-3 mb-2">
                        <strong>{metricLabels[metricName]}</strong>
                        <span className="text-secondary small">
                          {metric.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="progress usage-progress" role="progressbar">
                        <div
                          className={`progress-bar ${progressClass(metric.percent)}`}
                          style={{ width: `${Math.min(100, metric.percent)}%` }}
                        />
                      </div>
                      <div className="d-flex justify-content-between gap-3 mt-2 small text-secondary">
                        <span>
                          {formatMetricValue(metricName, metric.current)} used
                        </span>
                        <span>
                          {formatMetricValue(metricName, metric.limit)} limit
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-7">
              <div className="card h-100">
                <div className="card-header">
                  <strong>Projection</strong>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Current</th>
                        <th>Projected</th>
                        <th>Estimated overage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.metrics
                        .filter(item => item.projected !== item.current)
                        .map(item => (
                          <tr key={item.metric}>
                            <td>{metricLabels[item.metric]}</td>
                            <td>{formatMetricValue(item.metric, item.current)}</td>
                            <td>{formatMetricValue(item.metric, item.projected)}</td>
                            <td>{item.overage.formatted}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="col-lg-5">
              <div className="card h-100">
                <div className="card-header">
                  <strong>Billing workflow</strong>
                </div>
                <div className="list-group list-group-flush">
                  <a className="list-group-item list-group-item-action" href="/dashboard/billing/plans">
                    <i className="bi bi-boxes me-2 text-primary" />
                    Request a plan or currency change
                  </a>
                  <a className="list-group-item list-group-item-action" href="/dashboard/billing/usage">
                    <i className="bi bi-bar-chart me-2 text-primary" />
                    Review limits and projections
                  </a>
                  <a className="list-group-item list-group-item-action" href="/dashboard/billing/pay-as-you-go">
                    <i className="bi bi-lightning-charge me-2 text-primary" />
                    Configure saved-card pay as you go
                  </a>
                  <a className="list-group-item list-group-item-action" href="/dashboard/billing/settings">
                    <i className="bi bi-receipt me-2 text-primary" />
                    Update billing identity
                  </a>
                  <a className="list-group-item list-group-item-action" href="/dashboard/billing/payments">
                    <i className="bi bi-wallet2 me-2 text-primary" />
                    View invoices and payment history
                  </a>
                  <div className="list-group-item text-secondary small">
                    Paid plans support manual payment review and verified
                    SSLCOMMERZ checkout.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
