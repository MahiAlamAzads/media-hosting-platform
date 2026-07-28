"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import {
  formatMetricValue,
  metricLabels,
  progressClass,
  type UsageMetricName
} from "@/lib/billing-format";

type Metric = {
  metric: UsageMetricName;
  current: string;
  reserved: string;
  limit: string;
  percent: number;
  threshold: 70 | 80 | 90 | 100 | null;
  nextThreshold: 70 | 80 | 90 | 100 | null;
  state: string;
  blocked: boolean;
  paygEnabled: boolean;
  warningMessage: string | null;
  projected: string;
  projectedPercent: number;
  projectedState: string;
  hardLimit: boolean;
  overageAllowed: boolean;
  overage: { formatted: string };
};

type Usage = {
  plan: { name: string; code: string; version: number };
  subscription: {
    currency: string;
    interval: string;
    periodStart: string;
    periodEnd: string;
  };
  metrics: Metric[];
};

export default function BillingUsagePage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<{ data: Usage }>("/api/v1/billing/usage")
      .then(response => setUsage(response.data))
      .catch(value => setError(value.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Usage and limits"
        subtitle="Current consumption, hard limits and end-of-period projections."
      >
        <a className="btn btn-outline-secondary" href="/dashboard/billing">
          Billing overview
        </a>
        <a className="btn btn-primary" href="/dashboard/billing/plans">
          Compare plans
        </a>
      </PageHeader>

      <Feedback message={error} variant="danger" />

      {!usage ? (
        <LoadingBlock label="Loading usage meters…" />
      ) : (
        <div className="card">
          <div className="card-header d-flex flex-wrap justify-content-between gap-2">
            <strong>{usage.plan.name} limits</strong>
            <span className="text-secondary small">
              {new Date(usage.subscription.periodStart).toLocaleDateString()} –{" "}
              {new Date(usage.subscription.periodEnd).toLocaleDateString()}
            </span>
          </div>

          <div className="table-responsive">
            <table className="table mb-0 billing-usage-table">
              <thead>
                <tr>
                  <th>Meter</th>
                  <th>Current</th>
                  <th>Plan limit</th>
                  <th>Usage</th>
                  <th>Projected</th>
                  <th>Policy</th>
                </tr>
              </thead>
              <tbody>
                {usage.metrics.map(metric => (
                  <tr key={metric.metric}>
                    <td>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <strong>{metricLabels[metric.metric]}</strong>
                        {metric.paygEnabled ? (
                          <span className="badge text-bg-success">
                            Prepaid PAYG
                          </span>
                        ) : metric.threshold !== null ? (
                          <span
                            className={`badge ${
                              metric.threshold >= 90
                                ? "text-bg-danger"
                                : metric.threshold >= 80
                                  ? "text-bg-warning"
                                  : "text-bg-info"
                            }`}
                          >
                            {metric.blocked
                              ? "Stopped"
                              : `${metric.threshold}% warning`}
                          </span>
                        ) : null}
                      </div>
                      {metric.warningMessage && (
                        <div className={`small mt-1 ${metric.blocked ? "text-danger" : "text-secondary"}`}>
                          {metric.warningMessage}
                        </div>
                      )}
                      {Number(metric.reserved) > 0 && (
                        <div className="text-secondary small">
                          {formatMetricValue(metric.metric, metric.reserved)} reserved
                        </div>
                      )}
                    </td>
                    <td>{formatMetricValue(metric.metric, metric.current)}</td>
                    <td>
                      {metric.paygEnabled
                        ? "Pay per use"
                        : formatMetricValue(metric.metric, metric.limit)}
                    </td>
                    <td className="usage-cell">
                      {metric.paygEnabled ? (
                        <div>
                          <span className="badge text-bg-success">Metered</span>
                          <div className="small text-secondary mt-1">
                            Debited from prepaid wallet
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="d-flex justify-content-between small mb-1">
                            <span>{metric.percent.toFixed(1)}%</span>
                            <span>{metric.state}</span>
                          </div>
                          <div className="progress usage-progress">
                            <div
                              className={`progress-bar ${progressClass(metric.percent)}`}
                              style={{ width: `${Math.min(100, metric.percent)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      {formatMetricValue(metric.metric, metric.projected)}
                      {!metric.paygEnabled && metric.projectedPercent >= 70 && (
                        <div className="text-warning small">
                          {metric.projectedPercent.toFixed(1)}% projected
                        </div>
                      )}
                    </td>
                    <td>
                      {metric.paygEnabled ? (
                        <a className="badge text-bg-success text-decoration-none" href="/dashboard/billing/pay-as-you-go">
                          PAYG enabled
                        </a>
                      ) : metric.overageAllowed ? (
                        <span className="badge text-bg-info">Overage allowed</span>
                      ) : metric.hardLimit ? (
                        <span className="badge text-bg-secondary">Hard limit</span>
                      ) : (
                        <span className="badge text-bg-light border">Soft limit</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
