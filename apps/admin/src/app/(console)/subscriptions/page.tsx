"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type Currency = "BDT" | "USD";
type RevenueModel = "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";
type SubscriptionTerm = "FREE" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR" | "ENTERPRISE_CUSTOM";
type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED" | "EXPIRED";

type Subscription = {
  id: string;
  workspace: { id: string; name: string; slug: string; status: string };
  plan: { code: string; name: string; version: number };
  status: SubscriptionStatus;
  currency: Currency;
  interval: "MONTHLY" | "YEARLY";
  revenueModel: RevenueModel;
  subscriptionTerm: SubscriptionTerm;
  commitmentEndsAt: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  periodStart: string;
  periodEnd: string;
  pendingChange: null | {
    id: string;
    status: "PAYMENT_PENDING" | "PENDING" | "APPROVED";
    planCode: string;
    planName: string;
    currency: Currency;
    interval: "MONTHLY" | "YEARLY";
    requestedAt: string;
    requestedBy: { name: string; email: string };
  };
};

type Plan = {
  code: string;
  name: string;
  isActive: boolean;
  versions: Array<{
    version: number;
    publishedAt: string | null;
    retiredAt: string | null;
  }>;
};

type OverrideState = {
  subscription: Subscription;
  planCode: string;
  currency: Currency;
  revenueModel: RevenueModel;
  subscriptionTerm: SubscriptionTerm;
  status: SubscriptionStatus;
  periodStart: string;
  periodEnd: string;
  commitmentEndsAt: string;
  trialEndsAt: string;
  graceEndsAt: string;
  cancelAtPeriodEnd: boolean;
  cancelPendingRequests: boolean;
  note: string;
};

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusClass(status: string): string {
  if (status === "ACTIVE") return "text-bg-success";
  if (["PAST_DUE", "SUSPENDED", "EXPIRED"].includes(status)) return "text-bg-danger";
  if (["TRIALING", "GRACE_PERIOD"].includes(status)) return "text-bg-warning";
  return "text-bg-secondary";
}

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [override, setOverride] = useState<OverrideState | null>(null);

  const planOptions = useMemo(
    () => plans.filter(plan => plan.isActive && plan.versions.some(version => version.publishedAt && !version.retiredAt)),
    [plans]
  );

  async function load(nextStatus = status): Promise<void> {
    setLoading(true);
    try {
      const [subscriptions, planResponse] = await Promise.all([
        apiRequest<{ data: Subscription[] }>(
          `/api/v1/admin/subscriptions${nextStatus ? `?status=${nextStatus}` : ""}`
        ),
        apiRequest<{ data: Plan[] }>("/api/v1/admin/plans")
      ]);
      setItems(subscriptions.data);
      setPlans(planResponse.data);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openOverride(item: Subscription): void {
    setOverride({
      subscription: item,
      planCode: item.plan.code,
      currency: item.currency,
      revenueModel: item.revenueModel,
      subscriptionTerm: item.subscriptionTerm,
      status: item.status,
      periodStart: toLocalDateTime(item.periodStart),
      periodEnd: toLocalDateTime(item.periodEnd),
      commitmentEndsAt: toLocalDateTime(item.commitmentEndsAt),
      trialEndsAt: toLocalDateTime(item.trialEndsAt),
      graceEndsAt: toLocalDateTime(item.graceEndsAt),
      cancelAtPeriodEnd: item.cancelAtPeriodEnd,
      cancelPendingRequests: true,
      note: "Manual subscription adjustment by platform administrator."
    });
  }

  async function submitOverride(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!override) return;
    setBusy(override.subscription.workspace.id);
    try {
      await apiRequest(
        `/api/v1/admin/subscriptions/${override.subscription.workspace.id}/manual-override`,
        {
          method: "POST",
          body: JSON.stringify({
            planCode: override.planCode,
            currency: override.currency,
            revenueModel: override.revenueModel,
            subscriptionTerm: override.subscriptionTerm,
            status: override.status,
            periodStart: override.periodStart || undefined,
            periodEnd: override.periodEnd || undefined,
            commitmentEndsAt: override.commitmentEndsAt || null,
            trialEndsAt: override.trialEndsAt || null,
            graceEndsAt: override.graceEndsAt || null,
            cancelAtPeriodEnd: override.cancelAtPeriodEnd,
            cancelPendingRequests: override.cancelPendingRequests,
            note: override.note
          })
        }
      );
      setVariant("success");
      setMessage("Subscription override applied and written to the audit trail.");
      setOverride(null);
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function approve(item: Subscription): Promise<void> {
    if (!item.pendingChange) return;
    setBusy(item.workspace.id);
    try {
      const response = await apiRequest<{
        data: { changeScheduled: boolean; effectiveAt: string }
      }>(`/api/v1/admin/subscriptions/${item.workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          planCode: item.pendingChange.planCode,
          currency: item.pendingChange.currency,
          interval: item.pendingChange.interval,
          status: "ACTIVE",
          changeId: item.pendingChange.id,
          note: "Approved by platform administrator."
        })
      });
      setVariant("success");
      setMessage(
        response.data.changeScheduled
          ? `Change approved for ${new Date(response.data.effectiveAt).toLocaleString()}.`
          : "Plan request approved and activated."
      );
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function reject(item: Subscription): Promise<void> {
    if (!item.pendingChange) return;
    setBusy(item.workspace.id);
    try {
      await apiRequest(
        `/api/v1/admin/subscriptions/${item.workspace.id}/changes/${item.pendingChange.id}/reject`,
        { method: "POST", body: JSON.stringify({ note: "Rejected by platform administrator." }) }
      );
      setVariant("success");
      setMessage("Plan request rejected.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  function updateOverride<K extends keyof OverrideState>(key: K, value: OverrideState[K]): void {
    setOverride(current => current ? { ...current, [key]: value } : current);
  }

  return (
    <>
      <PageHeader
        title="Workspace subscriptions"
        subtitle="Approve customer requests or manually override plan, revenue model, term, dates and status."
      >
        <a className="btn btn-outline-primary" href="/billing-control">Billing control</a>
        <a className="btn btn-outline-secondary" href="/plans">Plans</a>
      </PageHeader>
      <Feedback message={message} variant={variant} onClose={() => setMessage("")} />

      {override && (
        <form className="card mb-4 border-primary" onSubmit={submitOverride}>
          <div className="card-header d-flex justify-content-between align-items-center gap-3">
            <div>
              <strong>Manual subscription override</strong>
              <div className="small text-secondary">{override.subscription.workspace.name} · {override.subscription.workspace.slug}</div>
            </div>
            <button className="btn-close" type="button" aria-label="Close" onClick={() => setOverride(null)} />
          </div>
          <div className="card-body">
            <div className="alert alert-warning py-2">
              This action applies immediately. Keep “cancel pending requests” enabled unless an existing payment or scheduled change must remain open.
            </div>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Plan</label>
                <select className="form-select" value={override.planCode} onChange={event => updateOverride("planCode", event.target.value)}>
                  {planOptions.map(plan => <option key={plan.code} value={plan.code}>{plan.name} ({plan.code})</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Revenue model</label>
                <select
                  className="form-select"
                  value={override.revenueModel}
                  onChange={event => {
                    const value = event.target.value as RevenueModel;
                    updateOverride("revenueModel", value);
                    const nextTerm = value === "PREPAID_PAYG"
                      ? "FREE"
                      : value === "ENTERPRISE_CUSTOM"
                        ? "ENTERPRISE_CUSTOM"
                        : override.subscriptionTerm === "ENTERPRISE_CUSTOM"
                          ? "THREE_MONTHS"
                          : override.subscriptionTerm;
                    updateOverride("subscriptionTerm", nextTerm);
                    if (value !== override.revenueModel) {
                      updateOverride("periodEnd", "");
                      updateOverride("commitmentEndsAt", "");
                    }
                  }}
                >
                  <option value="SUBSCRIPTION">Subscription</option>
                  <option value="PREPAID_PAYG">Prepaid PAYG</option>
                  <option value="ENTERPRISE_CUSTOM">Enterprise custom</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Term</label>
                <select
                  className="form-select"
                  value={override.subscriptionTerm}
                  disabled={override.revenueModel !== "SUBSCRIPTION"}
                  onChange={event => {
                    updateOverride("subscriptionTerm", event.target.value as SubscriptionTerm);
                    updateOverride("periodEnd", "");
                    updateOverride("commitmentEndsAt", "");
                  }}
                >
                  <option value="FREE">Free</option>
                  <option value="THREE_MONTHS">3 months</option>
                  <option value="SIX_MONTHS">6 months</option>
                  <option value="ONE_YEAR">1 year</option>
                  <option value="ENTERPRISE_CUSTOM">Enterprise custom</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Currency</label>
                <select className="form-select" value={override.currency} onChange={event => updateOverride("currency", event.target.value as Currency)}>
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Status</label>
                <select className="form-select" value={override.status} onChange={event => updateOverride("status", event.target.value as SubscriptionStatus)}>
                  {(["TRIALING", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "EXPIRED"] as SubscriptionStatus[]).map(value => <option key={value}>{value}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Period start</label>
                <input className="form-control" type="datetime-local" value={override.periodStart} onChange={event => updateOverride("periodStart", event.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Period end</label>
                <input className="form-control" type="datetime-local" value={override.periodEnd} onChange={event => updateOverride("periodEnd", event.target.value)} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Commitment end</label>
                <input className="form-control" type="datetime-local" value={override.commitmentEndsAt} onChange={event => updateOverride("commitmentEndsAt", event.target.value)} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Trial end</label>
                <input className="form-control" type="datetime-local" value={override.trialEndsAt} onChange={event => updateOverride("trialEndsAt", event.target.value)} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Grace end</label>
                <input className="form-control" type="datetime-local" value={override.graceEndsAt} onChange={event => updateOverride("graceEndsAt", event.target.value)} />
              </div>
              <div className="col-12">
                <label className="form-label">Admin reason</label>
                <textarea className="form-control" rows={3} minLength={3} required value={override.note} onChange={event => updateOverride("note", event.target.value)} />
              </div>
              <div className="col-md-6 form-check ms-2">
                <input className="form-check-input" id="cancelAtPeriodEnd" type="checkbox" checked={override.cancelAtPeriodEnd} onChange={event => updateOverride("cancelAtPeriodEnd", event.target.checked)} />
                <label className="form-check-label" htmlFor="cancelAtPeriodEnd">Cancel at period end</label>
              </div>
              <div className="col-md-5 form-check ms-2">
                <input className="form-check-input" id="cancelPendingRequests" type="checkbox" checked={override.cancelPendingRequests} onChange={event => updateOverride("cancelPendingRequests", event.target.checked)} />
                <label className="form-check-label" htmlFor="cancelPendingRequests">Cancel pending plan requests and renewal quotes</label>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex justify-content-end gap-2">
            <button className="btn btn-outline-secondary" type="button" onClick={() => setOverride(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy === override.subscription.workspace.id}>{busy ? "Applying…" : "Apply manual override"}</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-header d-flex flex-wrap gap-3 align-items-center justify-content-between">
          <strong>Subscriptions</strong>
          <select className="form-select form-select-sm admin-status-filter" value={status} onChange={event => { setStatus(event.target.value); void load(event.target.value); }}>
            <option value="">All statuses</option>
            {(["TRIALING", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "EXPIRED"] as SubscriptionStatus[]).map(value => <option key={value}>{value}</option>)}
          </select>
        </div>
        {loading ? <div className="card-body"><LoadingBlock label="Loading subscriptions…" /></div> : items.length === 0 ? <EmptyState icon="bi-credit-card" title="No subscriptions" text="No workspaces match this status." /> : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Workspace</th><th>Commercial state</th><th>Status</th><th>Period</th><th>Pending request</th><th /></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.workspace.name}</strong><div className="text-secondary small font-monospace">{item.workspace.slug}</div></td>
                    <td><strong>{item.plan.name}</strong> v{item.plan.version}<div className="text-secondary small">{item.currency} · {item.revenueModel.replaceAll("_", " ")} · {item.subscriptionTerm.replaceAll("_", " ")}</div>{item.commitmentEndsAt && <div className="text-secondary small">Commitment to {new Date(item.commitmentEndsAt).toLocaleDateString()}</div>}</td>
                    <td><span className={`badge ${statusClass(item.status)}`}>{item.status}</span>{item.cancelAtPeriodEnd && <div className="small text-danger mt-1">Cancels at period end</div>}</td>
                    <td><div>{new Date(item.periodStart).toLocaleDateString()}</div><div className="text-secondary small">to {new Date(item.periodEnd).toLocaleDateString()}</div></td>
                    <td>{item.pendingChange ? <div><strong>{item.pendingChange.planName}</strong><div className="text-secondary small">{item.pendingChange.currency} · {item.pendingChange.interval.toLowerCase()}</div><div className="text-secondary small">by {item.pendingChange.requestedBy.email}</div><span className={`badge mt-1 ${item.pendingChange.status === "APPROVED" ? "text-bg-info" : item.pendingChange.status === "PAYMENT_PENDING" ? "text-bg-primary" : "text-bg-warning"}`}>{item.pendingChange.status}</span></div> : <span className="text-secondary">None</span>}</td>
                    <td className="text-end">
                      <div className="d-flex justify-content-end flex-wrap gap-2">
                        {item.pendingChange?.status === "PENDING" && <><button className="btn btn-sm btn-outline-success" disabled={busy === item.workspace.id} onClick={() => void approve(item)}>Approve</button><button className="btn btn-sm btn-outline-danger" disabled={busy === item.workspace.id} onClick={() => void reject(item)}>Reject</button></>}
                        <button className="btn btn-sm btn-primary" onClick={() => openOverride(item)}>Manual control</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
