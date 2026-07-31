"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import { formatMoneyMinor } from "@/lib/billing-format";

type Currency = "BDT" | "USD";

type BillingQueue = {
  counts: {
    subscriptionChanges: number;
    payments: number;
    walletTopups: number;
    enterpriseInquiries: number;
    attentionSubscriptions: number;
  };
  subscriptionChanges: Array<{
    id: string;
    status: string;
    currency: Currency;
    interval: string;
    revenueModel: string;
    subscriptionTerm: string;
    createdAt: string;
    effectiveAt: string | null;
    workspace: { id: string; name: string; slug: string };
    requestedBy: { name: string; email: string };
    requestedPlan: { code: string; name: string; version: number };
    invoice: null | {
      number: string;
      status: string;
      amountMinor: string;
      currency: Currency;
      dueAt: string;
    };
  }>;
  payments: Array<{
    id: string;
    method: string;
    status: string;
    amountMinor: string;
    currency: Currency;
    createdAt: string;
    riskLevel: number | null;
    riskTitle: string | null;
    invoice: {
      number: string;
      kind: string;
      workspace: { name: string; slug: string };
      requestedBy: { name: string; email: string };
      plan: { name: string };
    };
    manualSubmission: null | {
      transactionReference: string;
      senderName: string | null;
      senderAccount: string | null;
      proofFilename: string | null;
    };
  }>;
  walletTopups: Array<{
    id: string;
    number: string;
    amountMinor: string;
    currency: Currency;
    dueAt: string;
    createdAt: string;
    workspace: { id: string; name: string; slug: string };
    requestedBy: { name: string; email: string };
    latestPayment: null | {
      id: string;
      method: string;
      status: string;
      createdAt: string;
    };
  }>;
  enterpriseInquiries: Array<{
    id: string;
    status: string;
    companyName: string;
    contactName: string;
    email: string;
    createdAt: string;
    workspace: { name: string; slug: string };
  }>;
  attentionSubscriptions: Array<{
    id: string;
    status: string;
    currency: Currency;
    revenueModel: string;
    subscriptionTerm: string;
    periodEnd: string;
    graceEndsAt: string | null;
    workspace: { id: string; name: string; slug: string; status: string };
    plan: { code: string; name: string; version: number };
  }>;
};

function statusClass(status: string): string {
  if (["PAID", "ACTIVE", "APPROVED"].includes(status)) return "text-bg-success";
  if (["PENDING", "PAYMENT_PENDING", "UNDER_REVIEW", "NEW"].includes(status)) {
    return "text-bg-warning";
  }
  if (["FAILED", "PAST_DUE", "SUSPENDED", "EXPIRED"].includes(status)) {
    return "text-bg-danger";
  }
  return "text-bg-secondary";
}

export default function BillingControlPage() {
  const [data, setData] = useState<BillingQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await apiRequest<{ data: BillingQueue }>(
        "/api/v1/admin/console/billing-control",
      );
      setData(response.data);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <LoadingBlock label="Loading billing queues…" />;
  }

  return (
    <>
      <PageHeader
        title="Billing control center"
        subtitle="One operational queue for subscription requests, payments, wallet top-ups and enterprise follow-up."
      >
        <button
          className="btn btn-outline-secondary"
          onClick={() => void load()}
        >
          <i className="bi bi-arrow-clockwise me-1" />
          Refresh
        </button>
      </PageHeader>

      <Feedback
        message={message}
        variant="danger"
        onClose={() => setMessage("")}
      />

      {data && (
        <>
          <div className="row g-3 mb-4">
            {[
              [
                "Subscription requests",
                data.counts.subscriptionChanges,
                "bi-arrow-repeat",
                "/subscriptions",
              ],
              [
                "Pending payments",
                data.counts.payments,
                "bi-cash-coin",
                "/payments",
              ],
              [
                "Open top-ups",
                data.counts.walletTopups,
                "bi-wallet2",
                "/wallets",
              ],
              [
                "Enterprise requests",
                data.counts.enterpriseInquiries,
                "bi-buildings",
                "/enterprise-inquiries",
              ],
              [
                "Needs attention",
                data.counts.attentionSubscriptions,
                "bi-exclamation-triangle",
                "/subscriptions",
              ],
            ].map(([label, count, icon, href]) => (
              <div className="col-sm-6 col-xl" key={String(label)}>
                <a
                  className="card h-100 text-decoration-none text-reset"
                  href={String(href)}
                >
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between gap-3">
                      <div>
                        <div className="text-secondary small">{label}</div>
                        <div className="fs-3 fw-semibold">{count}</div>
                      </div>
                      <i className={`bi ${icon} fs-3 text-secondary`} />
                    </div>
                  </div>
                </a>
              </div>
            ))}
          </div>

          <div className="card mb-4">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Pending subscription requests</strong>
              <a
                className="btn btn-sm btn-outline-primary"
                href="/subscriptions"
              >
                Manage subscriptions
              </a>
            </div>
            {data.subscriptionChanges.length === 0 ? (
              <EmptyState
                icon="bi-check2-circle"
                title="No pending subscription requests"
                text="All subscription requests are resolved."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Workspace</th>
                      <th>Requested plan</th>
                      <th>Requested by</th>
                      <th>Invoice</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptionChanges.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.workspace.name}</strong>
                          <div className="small text-secondary">
                            {item.workspace.slug}
                          </div>
                        </td>
                        <td>
                          {item.requestedPlan.name} v
                          {item.requestedPlan.version}
                          <div className="small text-secondary">
                            {item.currency} ·{" "}
                            {item.subscriptionTerm.replaceAll("_", " ")}
                          </div>
                        </td>
                        <td>
                          {item.requestedBy.name}
                          <div className="small text-secondary">
                            {item.requestedBy.email}
                          </div>
                        </td>
                        <td>
                          {item.invoice ? (
                            <>
                              <strong>{item.invoice.number}</strong>
                              <div className="small text-secondary">
                                {formatMoneyMinor(
                                  item.invoice.amountMinor,
                                  item.invoice.currency,
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-secondary">No invoice</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${statusClass(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>{new Date(item.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="row g-4 mb-4">
            <div className="col-xl-7">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <strong>Payments waiting for action</strong>
                  <a
                    className="btn btn-sm btn-outline-primary"
                    href="/payments"
                  >
                    Open payment review
                  </a>
                </div>
                {data.payments.length === 0 ? (
                  <EmptyState
                    icon="bi-check2-circle"
                    title="No pending payments"
                    text="No payment requires processing or review."
                  />
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Workspace</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.invoice.number}</strong>
                              <div className="small text-secondary">
                                {item.invoice.kind.replaceAll("_", " ")}
                              </div>
                            </td>
                            <td>
                              {item.invoice.workspace.name}
                              <div className="small text-secondary">
                                {item.invoice.requestedBy.email}
                              </div>
                            </td>
                            <td>
                              {formatMoneyMinor(
                                item.amountMinor,
                                item.currency,
                              )}
                            </td>
                            <td>
                              {item.method}
                              {item.manualSubmission && (
                                <div className="small text-secondary">
                                  Ref{" "}
                                  {item.manualSubmission.transactionReference}
                                </div>
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${statusClass(item.status)}`}
                              >
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="col-xl-5">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <strong>Open wallet top-ups</strong>
                  <a className="btn btn-sm btn-outline-primary" href="/wallets">
                    Manage wallets
                  </a>
                </div>
                {data.walletTopups.length === 0 ? (
                  <EmptyState
                    icon="bi-check2-circle"
                    title="No open top-ups"
                    text="There are no unpaid wallet top-up invoices."
                  />
                ) : (
                  <div className="list-group list-group-flush">
                    {data.walletTopups.map((item) => (
                      <div className="list-group-item" key={item.id}>
                        <div className="d-flex justify-content-between gap-3">
                          <div>
                            <strong>{item.workspace.name}</strong>
                            <div className="small text-secondary">
                              {item.number} · {item.requestedBy.email}
                            </div>
                          </div>
                          <strong>
                            {formatMoneyMinor(item.amountMinor, item.currency)}
                          </strong>
                        </div>
                        <div className="small text-secondary mt-1">
                          Due {new Date(item.dueAt).toLocaleDateString()} ·
                          Latest payment{" "}
                          {item.latestPayment?.status ?? "not started"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-xl-6">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <strong>Subscriptions needing attention</strong>
                  <a
                    className="btn btn-sm btn-outline-primary"
                    href="/subscriptions"
                  >
                    Manual control
                  </a>
                </div>
                {data.attentionSubscriptions.length === 0 ? (
                  <EmptyState
                    icon="bi-check2-circle"
                    title="No subscription alerts"
                    text="No active workspace is past due, suspended or expired."
                  />
                ) : (
                  <div className="list-group list-group-flush">
                    {data.attentionSubscriptions.map((item) => (
                      <div
                        className="list-group-item d-flex justify-content-between gap-3"
                        key={item.id}
                      >
                        <div>
                          <strong>{item.workspace.name}</strong>
                          <div className="small text-secondary">
                            {item.plan.name} · period ended{" "}
                            {new Date(item.periodEnd).toLocaleDateString()}
                          </div>
                        </div>
                        <span
                          className={`badge align-self-start ${statusClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-xl-6">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <strong>Enterprise follow-up</strong>
                  <a
                    className="btn btn-sm btn-outline-primary"
                    href="/enterprise-inquiries"
                  >
                    Manage inquiries
                  </a>
                </div>
                {data.enterpriseInquiries.length === 0 ? (
                  <EmptyState
                    icon="bi-check2-circle"
                    title="No enterprise requests"
                    text="No enterprise inquiry is waiting for follow-up."
                  />
                ) : (
                  <div className="list-group list-group-flush">
                    {data.enterpriseInquiries.map((item) => (
                      <div
                        className="list-group-item d-flex justify-content-between gap-3"
                        key={item.id}
                      >
                        <div>
                          <strong>{item.companyName}</strong>
                          <div className="small text-secondary">
                            {item.contactName} · {item.email}
                          </div>
                        </div>
                        <span
                          className={`badge align-self-start ${statusClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
