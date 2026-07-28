"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import { formatMetricValue, metricLabels, type UsageMetricName } from "@/lib/billing-format";

type Aggregate = {
  id: string;
  metric: UsageMetricName;
  quantity: string;
  periodStart: string;
  periodEnd: string;
  lastEventAt: string | null;
  workspace: { name: string; slug: string };
};

export default function AdminUsagePage() {
  const [items, setItems] = useState<Aggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest<{ data: Aggregate[] }>("/api/v1/admin/usage")
      .then(response => setItems(response.data))
      .catch(error => setMessage((error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const workspaceCount = useMemo(
    () => new Set(items.map(item => item.workspace.slug)).size,
    [items]
  );

  return (
    <>
      <PageHeader title="Platform usage" subtitle="Aggregated monthly usage across all workspaces and all metered resources.">
        <a className="btn btn-outline-secondary" href="/plans">Plans</a>
        <a className="btn btn-outline-secondary" href="/subscriptions">Subscriptions</a>
      </PageHeader>
      <Feedback message={message} variant="danger" />
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3"><div className="card stat-card"><div className="card-body"><div className="text-secondary small">Workspaces represented</div><div className="stat-value">{workspaceCount}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card stat-card"><div className="card-body"><div className="text-secondary small">Aggregate rows</div><div className="stat-value">{items.length}</div></div></div></div>
      </div>
      <div className="card">
        <div className="card-header"><strong>Usage aggregates</strong></div>
        {loading ? <div className="card-body"><LoadingBlock label="Loading platform usage…" /></div> : items.length === 0 ? <EmptyState icon="bi-bar-chart" title="No usage aggregates" text="Run the aggregation job after usage events exist." /> : (
          <div className="table-responsive"><table className="table table-hover mb-0"><thead><tr><th>Workspace</th><th>Metric</th><th className="text-end">Quantity</th><th>Period</th><th>Last event</th></tr></thead><tbody>
            {items.map(item => <tr key={item.id}><td><strong>{item.workspace.name}</strong><div className="text-secondary small font-monospace">{item.workspace.slug}</div></td><td>{metricLabels[item.metric]}<div className="text-secondary small font-monospace">{item.metric}</div></td><td className="text-end fw-semibold">{formatMetricValue(item.metric, item.quantity)}</td><td>{new Date(item.periodStart).toLocaleDateString()}<div className="text-secondary small">to {new Date(item.periodEnd).toLocaleDateString()}</div></td><td>{item.lastEventAt ? new Date(item.lastEventAt).toLocaleString() : '—'}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </>
  );
}
