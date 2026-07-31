"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LoadingBlock, Feedback } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
type D = {
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
const b = (v: string) => {
  let n = Number(v),
    i = 0;
  const u = ["B", "KB", "MB", "GB", "TB"];
  while (n >= 1024 && i < 4) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};
export default function Page() {
  const [d, setD] = useState<D | null>(null);
  const [e, setE] = useState("");
  useEffect(() => {
    apiRequest<{ data: D }>("/api/v1/usage/summary")
      .then((r) => setD(r.data))
      .catch((x) => setE(x.message));
  }, []);
  return (
    <>
      <PageHeader
        title="Usage"
        subtitle="Storage capacity and media distribution."
      />
      <Feedback message={e} variant="danger" />
      {!d ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-hdd"
                label="Used"
                value={b(d.storage?.usedBytes ?? "0")}
              />
            </div>
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-database-check"
                label="Available"
                value={b(d.storage?.availableBytes ?? "0")}
              />
            </div>
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-hourglass-split"
                label="Reserved"
                value={b(d.storage?.reservedBytes ?? "0")}
              />
            </div>
            <div className="col-sm-6 col-xl-3">
              <StatCard
                icon="bi-archive"
                label="Total assets"
                value={String(d.counts.readyAssets + d.counts.deletedAssets)}
              />
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <strong>Usage by media type</strong>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Media type</th>
                    <th>Count</th>
                    <th>Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {d.mediaByType.map((x) => (
                    <tr key={x.mediaType}>
                      <td>{x.mediaType}</td>
                      <td>{x.count}</td>
                      <td>{b(x.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
