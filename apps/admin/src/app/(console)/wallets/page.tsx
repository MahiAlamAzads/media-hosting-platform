"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { apiRequest } from "@/lib/api";
import { formatMoneyMinor } from "@/lib/billing-format";

type Currency = "BDT" | "USD";
type WalletStatus = "ACTIVE" | "FROZEN" | "CLOSED";

type WalletItem = {
  id: string;
  workspaceId: string;
  currency: Currency;
  status: WalletStatus;
  balanceMinor: string;
  reservedMinor: string;
  availableMinor: string;
  lowBalanceThresholdMinor: string;
  updatedAt: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    billingPreference: null | {
      revenueModel: string;
      subscriptionTerm: string;
    };
    subscription: null | {
      status: string;
      planVersion: { plan: { name: string } };
    };
  };
  transactions: Array<{
    id: string;
    kind: string;
    amountMinor: string;
    reference: string | null;
    createdAt: string;
  }>;
};

type EditMode = "adjust" | "settings";

type SelectedWallet = {
  wallet: WalletItem;
  mode: EditMode;
};

export default function WalletsPage() {
  const [items, setItems] = useState<WalletItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<SelectedWallet | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [settingsStatus, setSettingsStatus] = useState<WalletStatus>("ACTIVE");
  const [settingsCurrency, setSettingsCurrency] = useState<Currency>("BDT");
  const [threshold, setThreshold] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");

  async function load(targetPage = page): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: "20" });
      if (query) params.set("query", query);
      if (currency) params.set("currency", currency);
      if (status) params.set("status", status);
      const response = await apiRequest<{
        data: WalletItem[];
        meta: { totalPages: number };
      }>(`/api/v1/admin/console/wallets?${params}`);
      setItems(response.data);
      setPage(targetPage);
      setPages(response.meta.totalPages);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  function openAdjust(wallet: WalletItem): void {
    setSelected({ wallet, mode: "adjust" });
    setAmount("");
    setReason("");
  }

  function openSettings(wallet: WalletItem): void {
    setSelected({ wallet, mode: "settings" });
    setSettingsStatus(wallet.status);
    setSettingsCurrency(wallet.currency);
    setThreshold(String(Number(wallet.lowBalanceThresholdMinor) / 100));
    setReason("");
  }

  async function adjust(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || selected.mode !== "adjust") return;
    setBusy(true);
    try {
      const major = Number(amount);
      if (!Number.isFinite(major) || major === 0) {
        throw new Error("Enter a non-zero amount. Use a negative number to debit.");
      }
      await apiRequest(
        `/api/v1/admin/console/wallets/${selected.wallet.workspaceId}/adjust`,
        {
          method: "POST",
          body: JSON.stringify({
            amountMinor: String(Math.round(major * 100)),
            reason
          })
        }
      );
      setSelected(null);
      setVariant("success");
      setMessage("Wallet balance adjusted and audit entry created.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || selected.mode !== "settings") return;
    setBusy(true);
    try {
      const thresholdMajor = Number(threshold);
      if (!Number.isFinite(thresholdMajor) || thresholdMajor < 0) {
        throw new Error("Low-balance threshold must be zero or greater.");
      }
      await apiRequest(
        `/api/v1/admin/console/wallets/${selected.wallet.workspaceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: settingsStatus,
            currency: settingsCurrency,
            lowBalanceThresholdMinor: String(Math.round(thresholdMajor * 100)),
            reason
          })
        }
      );
      setSelected(null);
      setVariant("success");
      setMessage("Wallet settings updated and audit entry created.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Prepaid wallets"
        subtitle="Credit or debit balances, freeze access, reopen wallets and control low-balance warnings."
      >
        <a className="btn btn-outline-primary" href="/billing-control">Billing control</a>
        <a className="btn btn-outline-secondary" href="/payments">Pending payments</a>
      </PageHeader>
      <Feedback message={message} variant={variant} onClose={() => setMessage("")} />

      {selected?.mode === "adjust" && (
        <form className="card mb-4 border-primary" onSubmit={adjust}>
          <div className="card-header d-flex justify-content-between align-items-center">
            <div><strong>Adjust wallet balance</strong><div className="small text-secondary">{selected.wallet.workspace.name}</div></div>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelected(null)} />
          </div>
          <div className="card-body">
            <div className="alert alert-info py-2">
              Positive amount credits the wallet. Negative amount debits it. Balance cannot be reduced below reserved funds.
            </div>
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label">Amount ({selected.wallet.currency})</label>
                <input className="form-control" inputMode="decimal" placeholder="500 or -100" required value={amount} onChange={event => setAmount(event.target.value)} />
              </div>
              <div className="col-md">
                <label className="form-label">Admin reason</label>
                <input className="form-control" minLength={3} required value={reason} onChange={event => setReason(event.target.value)} />
              </div>
              <div className="col-auto"><button className="btn btn-primary" disabled={busy}>{busy ? "Applying…" : "Apply adjustment"}</button></div>
            </div>
          </div>
        </form>
      )}

      {selected?.mode === "settings" && (
        <form className="card mb-4 border-primary" onSubmit={saveSettings}>
          <div className="card-header d-flex justify-content-between align-items-center">
            <div><strong>Wallet settings</strong><div className="small text-secondary">{selected.wallet.workspace.name}</div></div>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelected(null)} />
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label">Status</label>
                <select className="form-select" value={settingsStatus} onChange={event => setSettingsStatus(event.target.value as WalletStatus)}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="FROZEN">FROZEN</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Currency</label>
                <select className="form-select" value={settingsCurrency} onChange={event => setSettingsCurrency(event.target.value as Currency)}>
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                </select>
                <div className="form-text">Currency changes only when balance and reserved funds are zero.</div>
              </div>
              <div className="col-md-3">
                <label className="form-label">Low-balance warning ({settingsCurrency})</label>
                <input className="form-control" inputMode="decimal" min="0" required value={threshold} onChange={event => setThreshold(event.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Admin reason</label>
                <input className="form-control" minLength={3} required value={reason} onChange={event => setReason(event.target.value)} />
              </div>
            </div>
          </div>
          <div className="card-footer d-flex justify-content-end gap-2">
            <button className="btn btn-outline-secondary" type="button" onClick={() => setSelected(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save wallet settings"}</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-header">
          <form className="row g-2" onSubmit={event => { event.preventDefault(); void load(1); }}>
            <div className="col-md"><input className="form-control" placeholder="Workspace name or slug" value={query} onChange={event => setQuery(event.target.value)} /></div>
            <div className="col-md-2"><select className="form-select" value={currency} onChange={event => setCurrency(event.target.value)}><option value="">All currencies</option><option>BDT</option><option>USD</option></select></div>
            <div className="col-md-2"><select className="form-select" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option>ACTIVE</option><option>FROZEN</option><option>CLOSED</option></select></div>
            <div className="col-auto"><button className="btn btn-outline-secondary">Filter</button></div>
          </form>
        </div>

        {loading ? <div className="card-body"><LoadingBlock /></div> : items.length === 0 ? (
          <div className="card-body"><EmptyState icon="bi-wallet2" title="No wallets found" text="Wallets appear when a workspace is created or enters prepaid billing." /></div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Workspace</th><th>Billing model</th><th>Status</th><th className="text-end">Balance</th><th className="text-end">Reserved</th><th className="text-end">Low warning</th><th>Updated</th><th className="text-end">Actions</th></tr></thead>
              <tbody>
                {items.map(wallet => (
                  <tr key={wallet.id}>
                    <td><strong>{wallet.workspace.name}</strong><div className="small text-secondary">{wallet.workspace.slug}</div></td>
                    <td>{wallet.workspace.billingPreference?.revenueModel?.replaceAll("_", " ") ?? "—"}<div className="small text-secondary">{wallet.workspace.subscription?.planVersion.plan.name ?? "No plan"}</div></td>
                    <td><span className={`badge ${wallet.status === "ACTIVE" ? "text-bg-success" : wallet.status === "FROZEN" ? "text-bg-warning" : "text-bg-secondary"}`}>{wallet.status}</span></td>
                    <td className="text-end fw-semibold">{formatMoneyMinor(wallet.balanceMinor, wallet.currency)}<div className="small text-secondary">Available {formatMoneyMinor(wallet.availableMinor, wallet.currency)}</div></td>
                    <td className="text-end">{formatMoneyMinor(wallet.reservedMinor, wallet.currency)}</td>
                    <td className="text-end">{formatMoneyMinor(wallet.lowBalanceThresholdMinor, wallet.currency)}</td>
                    <td>{new Date(wallet.updatedAt).toLocaleString()}</td>
                    <td className="text-end"><div className="btn-group btn-group-sm"><button className="btn btn-outline-primary" onClick={() => openAdjust(wallet)}>Credit/debit</button><button className="btn btn-outline-secondary" onClick={() => openSettings(wallet)}>Settings</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={pages} onChange={value => void load(value)} />
      </div>
    </>
  );
}
