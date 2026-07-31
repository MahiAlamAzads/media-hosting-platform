"use client";
import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingBlock } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { apiRequest } from "@/lib/api";
export default function SecurityEventsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  async function load(p = page) {
    setLoading(true);
    const q = new URLSearchParams({ page: String(p), limit: "40" });
    if (query) q.set("query", query);
    try {
      const r = await apiRequest<{ data: any[]; meta: { totalPages: number } }>(
        `/api/v1/admin/console/security-events?${q}`,
      );
      setItems(r.data);
      setPages(r.meta.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(1);
  }, []);
  async function search(e: FormEvent) {
    e.preventDefault();
    await load(1);
  }
  return (
    <>
      <PageHeader
        title="Security events"
        subtitle="Session reuse, authentication and high-risk account signals."
      />
      <div className="card">
        <div className="card-body border-bottom">
          <form className="d-flex gap-2" onSubmit={search}>
            <input
              className="form-control"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search event, severity or IP"
            />
            <button className="btn btn-primary">Search</button>
          </form>
        </div>
        {loading ? (
          <div className="card-body">
            <LoadingBlock />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Severity</th>
                  <th>Event</th>
                  <th>User</th>
                  <th>IP</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td>{new Date(x.createdAt).toLocaleString()}</td>
                    <td>
                      <span
                        className={`badge ${x.severity === "high" ? "text-bg-danger" : x.severity === "medium" ? "text-bg-warning" : "text-bg-secondary"}`}
                      >
                        {x.severity}
                      </span>
                    </td>
                    <td>
                      <code>{x.eventType}</code>
                    </td>
                    <td>{x.user?.email ?? "Unknown"}</td>
                    <td>{x.ipAddress ?? "—"}</td>
                    <td>
                      <details>
                        <summary>View</summary>
                        <pre className="admin-json mt-2">
                          {JSON.stringify(x.metadata, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={pages}
          onChange={(p) => void load(p)}
        />
      </div>
    </>
  );
}
