"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  EmptyState,
  Feedback,
  LoadingBlock
} from "@/components/feedback";
import {
  API_URL,
  apiRequest,
  getAccessToken
} from "@/lib/api";

type Payment = {
  id: string;
  method: "MANUAL" | "SSLCOMMERZ";
  status: string;
  amountMinor: string;
  currency: "BDT" | "USD";
  riskLevel: number | null;
  riskTitle: string | null;
  createdAt: string;
  invoice: {
    id: string;
    number: string;
    workspace: { name: string; slug: string };
    planVersion: { plan: { name: string } };
    requestedBy: { name: string; email: string };
  };
  manualSubmission: null | {
    transactionReference: string;
    senderAccount: string | null;
    senderName: string | null;
    paidAt: string;
    note: string | null;
    hasProof: boolean;
    account: {
      label: string;
      accountNumber: string;
    };
  };
};

type ReviewState = {
  payment: Payment;
  action: "approve" | "reject";
} | null;

function money(
  value: string,
  currency: "BDT" | "USD"
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(Number(value) / 100);
}

function statusClass(status: string): string {
  if (status === "PAID") return "text-bg-success";
  if (status === "UNDER_REVIEW") return "text-bg-warning";
  if (["FAILED", "REJECTED", "EXPIRED"].includes(status)) {
    return "text-bg-danger";
  }
  return "text-bg-secondary";
}

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">(
    "success"
  );
  const [status, setStatus] = useState("UNDER_REVIEW");
  const [busy, setBusy] = useState("");
  const [review, setReview] = useState<ReviewState>(null);

  async function load(nextStatus = status): Promise<void> {
    setLoading(true);
    try {
      const suffix = nextStatus
        ? `?status=${encodeURIComponent(nextStatus)}`
        : "";
      const response = await apiRequest<{ data: Payment[] }>(
        `/api/v1/admin/payments${suffix}`
      );
      setItems(response.data);
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

  async function submitReview(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (!review) return;

    const form = new FormData(event.currentTarget);
    const text = String(form.get("reviewText") ?? "").trim();

    if (review.action === "reject" && text.length < 3) {
      setVariant("danger");
      setMessage("A rejection reason of at least 3 characters is required.");
      return;
    }

    setBusy(review.payment.id);
    setMessage("");

    try {
      const path = review.action === "approve" ? "approve" : "reject";
      const body = review.action === "approve"
        ? { note: text || "Payment verified by platform administrator." }
        : { reason: text };

      await apiRequest(
        `/api/v1/admin/payments/${review.payment.id}/${path}`,
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );

      setVariant("success");
      setMessage(
        review.action === "approve"
          ? "Payment approved and subscription activated."
          : "Payment rejected. The invoice remains open for another attempt."
      );
      setReview(null);
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function openProof(payment: Payment): Promise<void> {
    const response = await fetch(
      `${API_URL}/api/v1/admin/payments/${payment.id}/proof`,
      {
        headers: {
          authorization: `Bearer ${getAccessToken()}`
        }
      }
    );

    if (!response.ok) {
      setVariant("danger");
      setMessage("Could not open payment proof.");
      return;
    }

    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <>
      <PageHeader
        title="Payment review"
        subtitle="Approve manual submissions and risk-flagged SSLCOMMERZ transactions only after verification."
      >
        <a className="btn btn-outline-primary" href="/billing-control">
          Billing control
        </a>
        <a
          className="btn btn-outline-secondary"
          href="/payment-accounts"
        >
          Payment accounts
        </a>
      </PageHeader>

      <Feedback
        message={message}
        variant={variant}
        onClose={() => setMessage("")}
      />

      {review && (
        <form
          className={`card mb-4 border-${
            review.action === "approve" ? "success" : "danger"
          }`}
          onSubmit={submitReview}
        >
          <div className="card-header d-flex justify-content-between gap-3 align-items-center">
            <strong>
              {review.action === "approve"
                ? "Approve payment"
                : "Reject payment"}
            </strong>
            <button
              className="btn-close"
              type="button"
              aria-label="Close review"
              onClick={() => setReview(null)}
            />
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <div className="small text-secondary">Invoice</div>
                <strong>{review.payment.invoice.number}</strong>
              </div>
              <div className="col-md-4">
                <div className="small text-secondary">Workspace</div>
                <strong>{review.payment.invoice.workspace.name}</strong>
              </div>
              <div className="col-md-4">
                <div className="small text-secondary">Amount</div>
                <strong>
                  {money(
                    review.payment.amountMinor,
                    review.payment.currency
                  )}
                </strong>
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="reviewText">
                  {review.action === "approve"
                    ? "Approval note"
                    : "Rejection reason"}
                </label>
                <textarea
                  className="form-control"
                  id="reviewText"
                  name="reviewText"
                  rows={3}
                  required={review.action === "reject"}
                  defaultValue={
                    review.action === "approve"
                      ? "Payment verified by platform administrator."
                      : ""
                  }
                />
              </div>
            </div>
          </div>
          <div className="card-footer d-flex justify-content-end gap-2">
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setReview(null)}
            >
              Cancel
            </button>
            <button
              className={`btn btn-${
                review.action === "approve" ? "success" : "danger"
              }`}
              disabled={busy === review.payment.id}
            >
              {busy === review.payment.id
                ? "Saving…"
                : review.action === "approve"
                  ? "Approve and activate"
                  : "Reject payment"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-header d-flex flex-wrap gap-3 justify-content-between align-items-center">
          <strong>Payment attempts</strong>
          <select
            className="form-select form-select-sm admin-status-filter"
            value={status}
            aria-label="Payment status filter"
            onChange={event => {
              setStatus(event.target.value);
              void load(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {[
              "PENDING",
              "PROCESSING",
              "UNDER_REVIEW",
              "PAID",
              "FAILED",
              "CANCELLED",
              "REJECTED",
              "EXPIRED",
              "REFUNDED"
            ].map(value => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="card-body">
            <LoadingBlock label="Loading payments…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="bi-cash-coin"
            title="No payments"
            text="No payments match this status."
          />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Workspace</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference or risk</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.invoice.number}</strong>
                      <div className="small text-secondary">
                        {item.invoice.planVersion.plan.name}
                      </div>
                    </td>
                    <td>
                      {item.invoice.workspace.name}
                      <div className="small text-secondary">
                        {item.invoice.requestedBy.email}
                      </div>
                    </td>
                    <td>{item.method}</td>
                    <td>{money(item.amountMinor, item.currency)}</td>
                    <td>
                      {item.manualSubmission ? (
                        <>
                          <div>
                            {item.manualSubmission.transactionReference}
                          </div>
                          <div className="small text-secondary">
                            {item.manualSubmission.account.label}
                            {item.manualSubmission.senderAccount
                              ? ` · ${item.manualSubmission.senderAccount}`
                              : ""}
                          </div>
                        </>
                      ) : item.riskLevel === 1 ? (
                        <span className="text-danger">
                          Risk review: {item.riskTitle ?? "High risk"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="text-end">
                      <div className="btn-group btn-group-sm">
                        {item.manualSubmission?.hasProof && (
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => void openProof(item)}
                          >
                            Proof
                          </button>
                        )}
                        {item.status === "UNDER_REVIEW" && (
                          <>
                            <button
                              className="btn btn-outline-success"
                              type="button"
                              disabled={busy === item.id}
                              onClick={() =>
                                setReview({
                                  payment: item,
                                  action: "approve"
                                })
                              }
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-outline-danger"
                              type="button"
                              disabled={busy === item.id}
                              onClick={() =>
                                setReview({
                                  payment: item,
                                  action: "reject"
                                })
                              }
                            >
                              Reject
                            </button>
                          </>
                        )}
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
