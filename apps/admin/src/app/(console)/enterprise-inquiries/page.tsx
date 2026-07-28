"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { apiRequest } from "@/lib/api";
import { formatBytes } from "@/lib/billing-format";

type Inquiry = {
  id: string;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED_WON" | "CLOSED_LOST";
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  teamSize: number | null;
  expectedStorageBytes: string | null;
  expectedDeliveryBytes: string | null;
  expectedMonthlyRequests: string | null;
  message: string | null;
  adminNotes: string | null;
  createdAt: string;
  workspace: { id: string; name: string; slug: string };
  createdBy: { id: string; name: string; email: string };
  assignedTo: null | { id: string; name: string; email: string };
};

export default function EnterpriseInquiriesPage() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [notes, setNotes] = useState("");
  const [nextStatus, setNextStatus] = useState("CONTACTED");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] =
    useState<"success" | "danger">("success");

  async function load(targetPage = page): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: "20"
      });
      if (query) params.set("query", query);
      if (status) params.set("status", status);
      const response = await apiRequest<{
        data: Inquiry[];
        meta: { totalPages: number };
      }>(`/api/v1/admin/console/enterprise-inquiries?${params}`);
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

  function choose(item: Inquiry): void {
    setSelected(item);
    setNotes(item.adminNotes ?? "");
    setNextStatus(item.status);
  }

  async function save(): Promise<void> {
    if (!selected) return;
    try {
      await apiRequest(
        `/api/v1/admin/console/enterprise-inquiries/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: nextStatus,
            adminNotes: notes || null
          })
        }
      );
      setSelected(null);
      setVariant("success");
      setMessage("Enterprise inquiry updated.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Enterprise inquiries"
        subtitle="Qualify custom commercial opportunities and record the sales outcome."
      />
      <Feedback message={message} variant={variant} />

      {selected && (
        <div className="card mb-4 border-dark">
          <div className="card-header d-flex justify-content-between">
            <strong>{selected.companyName}</strong>
            <button className="btn-close" onClick={() => setSelected(null)} />
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-lg-7">
                <p>{selected.message || "No additional requirements provided."}</p>
                <dl className="row small">
                  <dt className="col-5">Contact</dt>
                  <dd className="col-7">{selected.contactName} · {selected.email}</dd>
                  <dt className="col-5">Team</dt>
                  <dd className="col-7">{selected.teamSize ?? "—"}</dd>
                  <dt className="col-5">Storage</dt>
                  <dd className="col-7">{selected.expectedStorageBytes ? formatBytes(selected.expectedStorageBytes) : "—"}</dd>
                  <dt className="col-5">Delivery</dt>
                  <dd className="col-7">{selected.expectedDeliveryBytes ? formatBytes(selected.expectedDeliveryBytes) : "—"}</dd>
                  <dt className="col-5">Monthly requests</dt>
                  <dd className="col-7">{selected.expectedMonthlyRequests ? Number(selected.expectedMonthlyRequests).toLocaleString() : "—"}</dd>
                </dl>
              </div>
              <div className="col-lg-5">
                <label className="form-label">Pipeline status</label>
                <select className="form-select mb-3" value={nextStatus} onChange={event => setNextStatus(event.target.value)}>
                  <option>NEW</option>
                  <option>CONTACTED</option>
                  <option>QUALIFIED</option>
                  <option>CLOSED_WON</option>
                  <option>CLOSED_LOST</option>
                </select>
                <label className="form-label">Admin notes</label>
                <textarea className="form-control" rows={5} value={notes} onChange={event => setNotes(event.target.value)} />
              </div>
            </div>
          </div>
          <div className="card-footer text-end">
            <button className="btn btn-dark" onClick={save}>Save inquiry</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <form className="row g-2" onSubmit={event => {
            event.preventDefault();
            void load(1);
          }}>
            <div className="col-md">
              <input className="form-control" placeholder="Company or email" value={query} onChange={event => setQuery(event.target.value)} />
            </div>
            <div className="col-md-3">
              <select className="form-select" value={status} onChange={event => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option>NEW</option>
                <option>CONTACTED</option>
                <option>QUALIFIED</option>
                <option>CLOSED_WON</option>
                <option>CLOSED_LOST</option>
              </select>
            </div>
            <div className="col-auto">
              <button className="btn btn-outline-secondary">Search</button>
            </div>
          </form>
        </div>

        {loading ? <div className="card-body"><LoadingBlock /></div> :
          items.length === 0 ? (
            <div className="card-body">
              <EmptyState icon="bi-buildings" title="No inquiries" text="Enterprise requests will appear here." />
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead><tr><th>Company</th><th>Contact</th><th>Workspace</th><th>Status</th><th>Submitted</th><th className="text-end">Action</th></tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td><strong>{item.companyName}</strong><div className="small text-secondary">{item.teamSize ? `${item.teamSize} people` : "Team size unknown"}</div></td>
                      <td>{item.contactName}<div className="small text-secondary">{item.email}</div></td>
                      <td>{item.workspace.name}<div className="small text-secondary">{item.workspace.slug}</div></td>
                      <td><span className="badge text-bg-light">{item.status.replaceAll("_", " ")}</span></td>
                      <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td className="text-end"><button className="btn btn-sm btn-outline-dark" onClick={() => choose(item)}>Manage</button></td>
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
