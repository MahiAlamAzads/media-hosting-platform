"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type Invoice = {
  id: string;
  number: string;
  kind: "PLAN_CHANGE" | "RENEWAL" | "WALLET_TOPUP";
  periodStart: string;
  periodEnd: string;
  currency: "BDT" | "USD";
  interval: "MONTHLY" | "YEARLY";
  amountMinor: string;
  status: string;
  dueAt: string;
  createdAt: string;
  planVersion: { plan: { name: string } };
  payments: Array<{
    id: string;
    method: string;
    status: string;
    createdAt: string;
  }>;
};

function money(amountMinor: string, currency: "BDT" | "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amountMinor) / 100);
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<{ data: Invoice[] }>("/api/v1/payments/invoices")
      .then((response) => setItems(response.data))
      .catch((value) => setError(value.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Invoices, manual submissions and SSLCOMMERZ payment status."
      >
        <a className="btn btn-outline-primary" href="/dashboard/billing/plans">
          Choose plan
        </a>
      </PageHeader>

      <Feedback message={error} variant="danger" />

      <div className="card">
        <div className="card-header">
          <strong>Invoice history</strong>
        </div>
        {loading ? (
          <div className="card-body">
            <LoadingBlock label="Loading invoices…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="bi-receipt"
            title="No invoices"
            text="Subscription and wallet top-up invoices appear here."
          />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Latest payment</th>
                  <th>Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const latest = item.payments[0];
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.number}</strong>
                        <div className="text-secondary small">
                          {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        {item.kind === "RENEWAL"
                          ? "Renewal"
                          : item.kind === "WALLET_TOPUP"
                            ? "Wallet top-up"
                            : "Plan change"}
                      </td>
                      <td>
                        {item.kind === "WALLET_TOPUP"
                          ? "Prepaid wallet"
                          : item.planVersion.plan.name}
                        <div className="text-secondary small">
                          {item.kind === "WALLET_TOPUP"
                            ? item.currency
                            : item.interval.toLowerCase()}
                        </div>
                      </td>
                      <td>{money(item.amountMinor, item.currency)}</td>
                      <td>
                        <span
                          className={`badge ${item.status === "PAID" ? "text-bg-success" : item.status === "OPEN" ? "text-bg-warning" : "text-bg-secondary"}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>
                        {latest ? (
                          <>
                            <span>{latest.method}</span>
                            <div className="small text-secondary">
                              {latest.status}
                            </div>
                          </>
                        ) : (
                          <span className="text-secondary">Not started</span>
                        )}
                      </td>
                      <td>{new Date(item.dueAt).toLocaleDateString()}</td>
                      <td className="text-end">
                        <a
                          className="btn btn-sm btn-outline-primary"
                          href={`/dashboard/billing/payments/${item.id}`}
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
