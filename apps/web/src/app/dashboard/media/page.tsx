"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest, API_URL } from "@/lib/api";
type Asset = {
  id: string;
  originalFilename: string;
  detectedMediaType: string;
  detectedContentType: string | null;
  sizeBytes: string;
  visibility: "PRIVATE" | "PUBLIC";
  status: string;
  createdAt: string;
};
const bytes = (v: string) => {
  let n = Number(v),
    i = 0;
  const u = ["B", "KB", "MB", "GB", "TB"];
  while (n >= 1024 && i < 4) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};
export default function MediaPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  async function load() {
    setLoading(true);
    try {
      const r = await apiRequest<{ data: Asset[] }>(
        `/api/v1/media${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      );
      setItems(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function trash(id: string) {
    if (!confirm("Move this asset to trash?")) return;
    await apiRequest(`/api/v1/media/${id}`, { method: "DELETE" });
    load();
  }
  async function toggleVisibility(a: Asset) {
    await apiRequest(`/api/v1/media/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        visibility: a.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC",
      }),
    });
    load();
  }
  async function download(a: Asset) {
    const r = await apiRequest<{ data: { path: string } }>(
      `/api/v1/media/${a.id}/delivery-token`,
      { method: "POST", body: JSON.stringify({ disposition: "attachment" }) },
    );
    window.location.assign(`${API_URL}${r.data.path}`);
  }
  async function bulk(action: "TRASH" | "RESTORE") {
    if (!selected.length) return;
    await apiRequest("/api/v1/media/bulk", {
      method: "POST",
      body: JSON.stringify({ assetIds: selected, action }),
    });
    setSelected([]);
    load();
  }
  return (
    <>
      <PageHeader
        title="Media library"
        subtitle="Browse, search and manage uploaded assets."
      >
        <a className="btn btn-primary" href="/dashboard/upload">
          <i className="bi bi-plus-lg me-1" />
          Upload
        </a>
      </PageHeader>
      <Feedback message={error} variant="danger" />
      <div className="card">
        <div className="card-header">
          <div className="row g-2 align-items-center">
            <div className="col-sm">
              <form
                className="input-group"
                onSubmit={(e) => {
                  e.preventDefault();
                  load();
                }}
              >
                <span className="input-group-text">
                  <i className="bi bi-search" />
                </span>
                <input
                  className="form-control"
                  placeholder="Search filename"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn btn-outline-secondary">Search</button>
              </form>
            </div>
            <div className="col-sm-auto">
              <button
                className="btn btn-outline-danger"
                disabled={!selected.length}
                onClick={() => bulk("TRASH")}
              >
                <i className="bi bi-trash me-1" />
                Trash selected
              </button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="card-body">
            <LoadingBlock />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="bi-images"
            title="No media found"
            text="Upload your first media file or change the search filter."
          />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={
                        selected.length === items.length && items.length > 0
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? items.map((x) => x.id) : [],
                        )
                      }
                    />
                  </th>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Visibility</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, a.id]
                              : s.filter((x) => x !== a.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="file-thumb">
                          <i
                            className={`bi ${a.detectedMediaType === "IMAGE" ? "bi-image" : a.detectedMediaType === "VIDEO" ? "bi-film" : "bi-file-earmark"}`}
                          />
                        </div>
                        <div>
                          <a
                            className="fw-semibold text-dark"
                            href={`/dashboard/media/${a.id}`}
                          >
                            {a.originalFilename}
                          </a>
                          <div className="text-secondary small">
                            {a.detectedContentType ?? "Unknown type"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge text-bg-light border">
                        {a.detectedMediaType}
                      </span>
                    </td>
                    <td>{bytes(a.sizeBytes)}</td>
                    <td>
                      <button
                        className={`badge border-0 ${a.visibility === "PUBLIC" ? "text-bg-success" : "text-bg-secondary"}`}
                        onClick={() => toggleVisibility(a)}
                      >
                        {a.visibility}
                      </button>
                    </td>
                    <td>{a.status}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td className="text-end">
                      <div className="btn-group btn-group-sm">
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => download(a)}
                          title="Download"
                        >
                          <i className="bi bi-download" />
                        </button>
                        <a
                          className="btn btn-outline-secondary"
                          href={`/dashboard/media/${a.id}`}
                        >
                          <i className="bi bi-pencil" />
                        </a>
                        <button
                          className="btn btn-outline-danger"
                          onClick={() => trash(a.id)}
                        >
                          <i className="bi bi-trash" />
                        </button>
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
