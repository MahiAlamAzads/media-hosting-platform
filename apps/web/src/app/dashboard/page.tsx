"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
type Summary = {
  storage: {
    limitBytes: string;
    usedBytes: string;
    reservedBytes: string;
    availableBytes: string;
  } | null;
  counts: {
    readyAssets: number;
    deletedAssets: number;
    activeUploads: number;
    folders: number;
  };
  mediaByType: Array<{ mediaType: string; count: number; sizeBytes: string }>;
};
const bytes = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    x = n;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i ? 1 : 0)} ${u[i]}`;
};
export default function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest<{ data: Summary }>("/api/v1/usage/summary")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Workspace storage and media activity."
      >
        <a className="btn btn-primary" href="/dashboard/upload">
          <i className="bi bi-cloud-arrow-up me-1" />
          Upload media
        </a>
      </PageHeader>
      <Feedback message={error} variant="danger" />
      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-xl-3">
              <StatCard
                icon="bi-hdd"
                label="Storage used"
                value={bytes(data.storage?.usedBytes ?? "0")}
                hint={
                  data.storage
                    ? `${bytes(data.storage.availableBytes)} available`
                    : "Unavailable"
                }
              />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard
                icon="bi-images"
                label="Ready assets"
                value={String(data.counts.readyAssets)}
              />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard
                icon="bi-folder2"
                label="Folders"
                value={String(data.counts.folders)}
              />
            </div>
            <div className="col-6 col-xl-3">
              <StatCard
                icon="bi-arrow-repeat"
                label="Active uploads"
                value={String(data.counts.activeUploads)}
              />
            </div>
          </div>
          <div className="row g-4">
            <div className="col-xl-8">
              <div className="card">
                <div className="card-header">
                  <strong>Media by type</strong>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Assets</th>
                        <th>Storage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.mediaByType.map((x) => (
                        <tr key={x.mediaType}>
                          <td>
                            <span className="badge text-bg-light border">
                              {x.mediaType}
                            </span>
                          </td>
                          <td>{x.count}</td>
                          <td>{bytes(x.sizeBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-xl-4">
              <div className="card">
                <div className="card-header">
                  <strong>Quick actions</strong>
                </div>
                <div className="list-group list-group-flush">
                  <a
                    className="list-group-item list-group-item-action"
                    href="/dashboard/upload"
                  >
                    <i className="bi bi-cloud-arrow-up me-2 text-primary" />
                    Upload files
                  </a>
                  <a
                    className="list-group-item list-group-item-action"
                    href="/dashboard/folders"
                  >
                    <i className="bi bi-folder-plus me-2 text-primary" />
                    Create folder
                  </a>
                  <a
                    className="list-group-item list-group-item-action"
                    href="/dashboard/api-keys"
                  >
                    <i className="bi bi-key me-2 text-primary" />
                    Manage API keys
                  </a>
                  <a
                    className="list-group-item list-group-item-action"
                    href="/dashboard/security"
                  >
                    <i className="bi bi-shield-check me-2 text-primary" />
                    Review security
                  </a>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
