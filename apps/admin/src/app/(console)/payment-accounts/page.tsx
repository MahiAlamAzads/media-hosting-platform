"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type Account = {
  id: string;
  currency: "BDT" | "USD";
  channel: string;
  label: string;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  branchName: string | null;
  routingNumber: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
};
const channels = [
  "BANK_TRANSFER",
  "BKASH",
  "NAGAD",
  "ROCKET",
  "WISE",
  "PAYONEER",
  "OTHER",
];
export default function PaymentAccountsPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  async function load() {
    setLoading(true);
    try {
      const r = await apiRequest<{ data: Account[] }>(
        "/api/v1/admin/payment-accounts",
      );
      setItems(r.data);
    } catch (e) {
      setVariant("danger");
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await apiRequest("/api/v1/admin/payment-accounts", {
        method: "POST",
        body: JSON.stringify({
          currency: f.get("currency"),
          channel: f.get("channel"),
          label: f.get("label"),
          accountName: f.get("accountName"),
          accountNumber: f.get("accountNumber"),
          bankName: f.get("bankName") || null,
          branchName: f.get("branchName") || null,
          routingNumber: f.get("routingNumber") || null,
          instructions: f.get("instructions") || null,
          sortOrder: Number(f.get("sortOrder") || 0),
          isActive: true,
        }),
      });
      form.reset();
      setVariant("success");
      setMessage("Payment account created.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }
  async function toggle(item: Account) {
    try {
      await apiRequest(`/api/v1/admin/payment-accounts/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        title="Manual payment accounts"
        subtitle="Configure the exact BDT and USD destinations shown on invoices."
      >
        <a className="btn btn-outline-secondary" href="/payments">
          Payment review
        </a>
      </PageHeader>
      <Feedback
        message={message}
        variant={variant}
        onClose={() => setMessage("")}
      />
      <div className="row g-4">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header">
              <strong>Add account</strong>
            </div>
            <div className="card-body">
              <form className="row g-3" onSubmit={create}>
                <div className="col-md-6">
                  <label className="form-label">Currency</label>
                  <select className="form-select" name="currency">
                    <option>BDT</option>
                    <option>USD</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Channel</label>
                  <select className="form-select" name="channel">
                    {channels.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">Display label</label>
                  <input className="form-control" name="label" required />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Account name</label>
                  <input className="form-control" name="accountName" required />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Account number</label>
                  <input
                    className="form-control"
                    name="accountNumber"
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Bank/provider</label>
                  <input className="form-control" name="bankName" />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Branch</label>
                  <input className="form-control" name="branchName" />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Routing number</label>
                  <input className="form-control" name="routingNumber" />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Sort order</label>
                  <input
                    className="form-control"
                    name="sortOrder"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Instructions</label>
                  <textarea
                    className="form-control"
                    name="instructions"
                    rows={3}
                  />
                </div>
                <div className="col-12">
                  <button className="btn btn-primary">Create account</button>
                </div>
              </form>
            </div>
          </div>
        </div>
        <div className="col-xl-7">
          <div className="card">
            <div className="card-header">
              <strong>Configured accounts</strong>
            </div>
            {loading ? (
              <div className="card-body">
                <LoadingBlock label="Loading accounts…" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon="bi-bank"
                title="No payment accounts"
                text="Add at least one account before enabling manual payments."
              />
            ) : (
              <div className="list-group list-group-flush">
                {items.map((item) => (
                  <div
                    className="list-group-item d-flex justify-content-between gap-3"
                    key={item.id}
                  >
                    <div>
                      <strong>{item.label}</strong>
                      <div className="small text-secondary">
                        {item.currency} · {item.channel} · {item.accountNumber}
                      </div>
                      <div className="small">
                        {item.accountName}
                        {item.bankName ? ` · ${item.bankName}` : ""}
                      </div>
                    </div>
                    <button
                      className={`btn btn-sm ${item.isActive ? "btn-outline-danger" : "btn-outline-success"}`}
                      onClick={() => toggle(item)}
                    >
                      {item.isActive ? "Disable" : "Enable"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
