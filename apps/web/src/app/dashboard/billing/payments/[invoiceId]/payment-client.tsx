"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { API_URL, apiRequest, getAccessToken } from "@/lib/api";

type Config = {
  manualPaymentEnabled: boolean;
  manualProofRequired: boolean;
  manualProofMaxBytes: number;
  sslcommerzEnabled: boolean;
  sslcommerzSandbox: boolean;
};
type Account = {
  id: string;
  channel: string;
  label: string;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  branchName: string | null;
  routingNumber: string | null;
  instructions: string | null;
};
type Payment = {
  id: string;
  method: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  manualSubmission: null | {
    transactionReference: string;
    proofFilename: string | null;
    hasProof: boolean;
    rejectionReason: string | null;
    account: Account;
  };
};
type Invoice = {
  id: string;
  number: string;
  kind: "PLAN_CHANGE" | "RENEWAL" | "WALLET_TOPUP";
  periodStart: string;
  periodEnd: string;
  currency: "BDT" | "USD";
  interval: string;
  amountMinor: string;
  status: string;
  dueAt: string;
  planVersion: { plan: { name: string } };
  payments: Payment[];
};

function money(amountMinor: string, currency: "BDT" | "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amountMinor) / 100,
  );
}

export function InvoicePaymentClient() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const query = useSearchParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState(
    query.get("payment") ? `Payment result: ${query.get("payment")}` : "",
  );
  const [variant, setVariant] = useState<"success" | "danger" | "warning">(
    "warning",
  );
  const [busy, setBusy] = useState("");
  const [retryProof, setRetryProof] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  async function load(): Promise<void> {
    try {
      const [invoiceResponse, configResponse] = await Promise.all([
        apiRequest<{ data: Invoice }>(`/api/v1/payments/invoices/${invoiceId}`),
        apiRequest<{ data: Config }>("/api/v1/payments/config"),
      ]);
      setInvoice(invoiceResponse.data);
      setConfig(configResponse.data);
      const accountResponse = await apiRequest<{ data: Account[] }>(
        `/api/v1/payments/manual-accounts?currency=${invoiceResponse.data.currency}`,
      );
      setAccounts(accountResponse.data);
      setSelectedAccountId(
        (current) => current || accountResponse.data[0]?.id || "",
      );
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [invoiceId]);

  async function startSslcommerz(): Promise<void> {
    setBusy("sslcommerz");
    try {
      const response = await apiRequest<{ data: { gatewayPageUrl: string } }>(
        `/api/v1/payments/invoices/${invoiceId}/sslcommerz`,
        { method: "POST", body: JSON.stringify({}) },
      );
      window.location.assign(response.data.gatewayPageUrl);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
      setBusy("");
    }
  }

  async function uploadProof(paymentId: string, proof: File): Promise<void> {
    if (config && proof.size > config.manualProofMaxBytes) {
      throw new Error("Payment proof exceeds the configured size limit.");
    }

    const upload = await fetch(
      `${API_URL}/api/v1/payments/manual/${paymentId}/proof`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${getAccessToken()}`,
          "content-type": proof.type,
          "x-file-name": proof.name,
        },
        body: proof,
      },
    );

    if (!upload.ok) {
      const payload = await upload.json().catch(() => null);
      throw new Error(
        payload?.error?.message ?? "Payment proof upload failed.",
      );
    }
  }

  async function retryMissingProof(
    event: FormEvent<HTMLFormElement>,
    paymentId: string,
  ): Promise<void> {
    event.preventDefault();

    if (!retryProof || retryProof.size === 0) {
      setVariant("danger");
      setMessage("Select a payment proof file.");
      return;
    }

    setBusy(`proof:${paymentId}`);
    setMessage("");

    try {
      await uploadProof(paymentId, retryProof);
      setRetryProof(null);
      setVariant("success");
      setMessage("Payment proof uploaded for administrator review.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function submitManual(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("manual");
    const form = new FormData(formElement);
    const proof = form.get("proof");

    try {
      const response = await apiRequest<{
        data: { id: string; proofRequired: boolean };
      }>(`/api/v1/payments/invoices/${invoiceId}/manual`, {
        method: "POST",
        body: JSON.stringify({
          accountId: form.get("accountId"),
          transactionReference: form.get("transactionReference"),
          senderAccount: form.get("senderAccount") || null,
          senderName: form.get("senderName") || null,
          paidAt: form.get("paidAt"),
          note: form.get("note") || null,
        }),
      });

      if (response.data.proofRequired) {
        if (!(proof instanceof File) || proof.size === 0) {
          throw new Error("Select a payment proof file.");
        }
        await uploadProof(response.data.id, proof);
      }

      formElement.reset();
      setVariant("success");
      setMessage("Manual payment submitted for administrator review.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!invoice || !config) return <LoadingBlock label="Loading invoice…" />;

  const open = invoice.status === "OPEN";
  const activePayment = invoice.payments.some((item) =>
    ["PENDING", "PROCESSING", "UNDER_REVIEW", "PAID"].includes(item.status),
  );
  const selectedAccount = accounts.find(
    (item) => item.id === selectedAccountId,
  );
  const missingProofPayment = invoice.payments.find(
    (item) =>
      item.method === "MANUAL" &&
      item.status === "PENDING" &&
      !item.manualSubmission?.hasProof,
  );

  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={
          invoice.kind === "WALLET_TOPUP"
            ? `Prepaid wallet top-up · ${invoice.currency}`
            : `${invoice.planVersion.plan.name} · ${
                invoice.kind === "RENEWAL" ? "renewal" : "plan change"
              } · ${invoice.interval.toLowerCase()}`
        }
      >
        <a
          className="btn btn-outline-secondary"
          href="/dashboard/billing/payments"
        >
          All invoices
        </a>
      </PageHeader>
      <Feedback
        message={message}
        variant={variant}
        onClose={() => setMessage("")}
      />

      <div className="row g-4 mb-4">
        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-secondary small">Amount</div>
              <div className="h3 mb-0">
                {money(invoice.amountMinor, invoice.currency)}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-secondary small">Invoice status</div>
              <div className="h4 mb-0">{invoice.status}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-secondary small">Due date</div>
              <div className="h4 mb-0">
                {new Date(invoice.dueAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {open && missingProofPayment && (
        <form
          className="alert alert-warning mb-4"
          onSubmit={(event) =>
            void retryMissingProof(event, missingProofPayment.id)
          }
        >
          <h2 className="h6">Payment proof is still required</h2>
          <p className="mb-3">
            The manual payment reference was saved, but its proof was not
            uploaded. Upload the file below to submit it for review.
          </p>
          <div className="row g-2 align-items-end">
            <div className="col-md">
              <label className="form-label" htmlFor="retryProof">
                JPEG, PNG, WebP or PDF
              </label>
              <input
                className="form-control"
                id="retryProof"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
                onChange={(event) =>
                  setRetryProof(event.target.files?.[0] ?? null)
                }
              />
            </div>
            <div className="col-md-auto">
              <button
                className="btn btn-warning"
                disabled={busy === `proof:${missingProofPayment.id}`}
              >
                {busy === `proof:${missingProofPayment.id}`
                  ? "Uploading…"
                  : "Upload proof"}
              </button>
            </div>
          </div>
        </form>
      )}

      {open && !activePayment && (
        <div className="row g-4">
          <div className="col-lg-5">
            <div className="card h-100">
              <div className="card-header">
                <strong>SSLCOMMERZ</strong>
              </div>
              <div className="card-body">
                <p className="text-secondary">
                  Pay through the hosted SSLCOMMERZ checkout. Subscription
                  activation or wallet credit happens only after server-side
                  validation.
                </p>
                {config.sslcommerzSandbox && (
                  <div className="alert alert-warning">
                    Sandbox mode is active.
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!config.sslcommerzEnabled || busy === "sslcommerz"}
                  onClick={startSslcommerz}
                >
                  {busy === "sslcommerz"
                    ? "Opening checkout…"
                    : "Pay with SSLCOMMERZ"}
                </button>
                {!config.sslcommerzEnabled && (
                  <div className="form-text mt-2">
                    Gateway is not configured.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-lg-7">
            <div className="card h-100">
              <div className="card-header">
                <strong>Manual payment</strong>
              </div>
              <div className="card-body">
                {!config.manualPaymentEnabled ? (
                  <div className="alert alert-secondary">
                    Manual payment is disabled.
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="alert alert-warning">
                    No {invoice.currency} payment account is configured. Contact
                    support.
                  </div>
                ) : (
                  <form className="row g-3" onSubmit={submitManual}>
                    <div className="col-12">
                      <label className="form-label">Pay to</label>
                      <select
                        className="form-select"
                        name="accountId"
                        required
                        value={selectedAccountId}
                        onChange={(event) =>
                          setSelectedAccountId(event.target.value)
                        }
                      >
                        {accounts.map((account) => (
                          <option value={account.id} key={account.id}>
                            {account.label} · {account.accountNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedAccount && (
                      <div className="col-12">
                        <div className="border rounded p-3 bg-body-tertiary">
                          <div className="fw-semibold">
                            {selectedAccount.accountName}
                          </div>
                          <div>{selectedAccount.accountNumber}</div>
                          <div className="small text-secondary mt-1">
                            {[
                              selectedAccount.bankName,
                              selectedAccount.branchName,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          {selectedAccount.routingNumber && (
                            <div className="small mt-1">
                              Routing: {selectedAccount.routingNumber}
                            </div>
                          )}
                          {selectedAccount.instructions && (
                            <div className="small mt-2">
                              {selectedAccount.instructions}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="col-md-6">
                      <label className="form-label">
                        Transaction reference
                      </label>
                      <input
                        className="form-control"
                        name="transactionReference"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">
                        Payment date and time
                      </label>
                      <input
                        className="form-control"
                        name="paidAt"
                        type="datetime-local"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Sender account</label>
                      <input className="form-control" name="senderAccount" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Sender name</label>
                      <input className="form-control" name="senderName" />
                    </div>
                    {config.manualProofRequired && (
                      <div className="col-12">
                        <label className="form-label">Payment proof</label>
                        <input
                          className="form-control"
                          name="proof"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          required
                        />
                        <div className="form-text">JPEG, PNG, WebP or PDF.</div>
                      </div>
                    )}
                    <div className="col-12">
                      <label className="form-label">Note</label>
                      <textarea className="form-control" name="note" rows={3} />
                    </div>
                    <div className="col-12">
                      <button
                        className="btn btn-outline-primary"
                        disabled={busy === "manual"}
                      >
                        {busy === "manual"
                          ? "Submitting…"
                          : "Submit manual payment"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <div className="card-header">
          <strong>Payment attempts</strong>
        </div>
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Method</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Created</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-secondary text-center py-4">
                    No payment attempts.
                  </td>
                </tr>
              ) : (
                invoice.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.method}</td>
                    <td>
                      <span
                        className={`badge ${payment.status === "PAID" ? "text-bg-success" : payment.status === "UNDER_REVIEW" ? "text-bg-warning" : payment.status === "FAILED" || payment.status === "REJECTED" ? "text-bg-danger" : "text-bg-secondary"}`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td>
                      {payment.manualSubmission?.transactionReference ?? "—"}
                    </td>
                    <td>{new Date(payment.createdAt).toLocaleString()}</td>
                    <td>
                      {payment.failureReason ??
                        payment.manualSubmission?.rejectionReason ??
                        "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
