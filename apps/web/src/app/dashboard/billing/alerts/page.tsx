"use client";

import { useEffect, useState } from "react";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { PageHeader } from "@/components/page-header";
import { apiRequest } from "@/lib/api";
import { metricLabels, type UsageMetricName } from "@/lib/billing-format";

type UsageAlert = {
  id: string;
  metric: UsageMetricName;
  threshold: number;
  periodStart: string;
  periodEnd: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  emailStatus: "PENDING" | "SENDING" | "SENT" | "FAILED";
  emailRecipient: string | null;
  emailSentAt: string | null;
  lastEmailAttemptAt: string | null;
  emailLastError: string | null;
};

function thresholdBadge(threshold: number): string {
  if (threshold >= 90) return "text-bg-danger";
  if (threshold >= 80) return "text-bg-warning";
  return "text-bg-info";
}

function emailBadge(status: UsageAlert["emailStatus"]): string {
  if (status === "SENT") return "text-bg-success";
  if (status === "FAILED") return "text-bg-danger";
  if (status === "SENDING") return "text-bg-primary";
  return "text-bg-secondary";
}

export default function UsageAlertsPage() {
  const [alerts, setAlerts] = useState<UsageAlert[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(): Promise<void> {
    try {
      const response = await apiRequest<{ data: UsageAlert[] }>(
        "/api/v1/billing/alerts",
      );
      setAlerts(response.data);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to load alerts.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function acknowledge(alertId: string): Promise<void> {
    setBusyId(alertId);
    setError("");

    try {
      await apiRequest(`/api/v1/billing/alerts/${alertId}`, {
        method: "PATCH",
      });
      await load();
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Unable to acknowledge the alert.",
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHeader
        title="Usage alerts"
        subtitle="70%, 80%, 90% and 100% limit notifications with email delivery history."
      >
        <a
          className="btn btn-outline-secondary"
          href="/dashboard/billing/usage"
        >
          Usage and limits
        </a>
        <a className="btn btn-primary" href="/dashboard/billing/plans">
          Compare plans
        </a>
      </PageHeader>

      <Feedback message={error} variant="danger" />

      {!alerts ? (
        <LoadingBlock label="Loading usage alerts…" />
      ) : alerts.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-5">
            <i className="bi bi-check-circle fs-1 text-success" />
            <h2 className="h5 mt-3">No usage alerts</h2>
            <p className="text-secondary mb-0">
              Alerts will appear when a meter reaches 70% of its plan limit.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Meter</th>
                  <th>Threshold</th>
                  <th>Triggered</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <strong>{metricLabels[alert.metric]}</strong>
                      <div className="small text-secondary">
                        {new Date(alert.periodStart).toLocaleDateString()} –{" "}
                        {new Date(alert.periodEnd).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${thresholdBadge(alert.threshold)}`}
                      >
                        {alert.threshold}%
                      </span>
                    </td>
                    <td>{new Date(alert.triggeredAt).toLocaleString()}</td>
                    <td>
                      <span
                        className={`badge ${emailBadge(alert.emailStatus)}`}
                      >
                        {alert.emailStatus}
                      </span>
                      {alert.emailRecipient && (
                        <div className="small text-secondary mt-1">
                          {alert.emailRecipient}
                        </div>
                      )}
                      {alert.emailLastError && (
                        <div className="small text-danger mt-1">
                          {alert.emailLastError}
                        </div>
                      )}
                    </td>
                    <td>
                      {alert.acknowledgedAt ? (
                        <span className="badge text-bg-light border">
                          Acknowledged
                        </span>
                      ) : (
                        <span className="badge text-bg-warning">
                          Attention required
                        </span>
                      )}
                    </td>
                    <td className="text-end">
                      {!alert.acknowledgedAt && alert.threshold < 100 && (
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          disabled={busyId === alert.id}
                          onClick={() => acknowledge(alert.id)}
                        >
                          {busyId === alert.id ? "Saving…" : "Acknowledge"}
                        </button>
                      )}
                      {alert.threshold >= 100 && (
                        <a
                          className="btn btn-danger btn-sm"
                          href="/dashboard/billing/plans"
                        >
                          Upgrade
                        </a>
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
