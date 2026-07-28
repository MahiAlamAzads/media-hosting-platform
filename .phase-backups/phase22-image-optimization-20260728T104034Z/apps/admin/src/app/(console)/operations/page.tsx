"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingBlock } from "@/components/feedback";
import { StatCard } from "@/components/stat-card";
import { apiRequest } from "@/lib/api";
import { formatBytes } from "@/lib/billing-format";

type Data = {
  counts: Record<string, number>;
  uploads: Array<any>;
  failedAssets: Array<any>;
  variants: Array<any>;
  webhookFailures: Array<any>;
  failedUsageEmails: Array<any>;
  failedPaygCharges: Array<any>;
  redis: {
    configured: boolean;
    required: boolean;
    status: "disabled" | "ready" | "unavailable";
    isOpen: boolean;
    isReady: boolean;
    connectedAt: string | null;
    lastError: string | null;
    counters: {
      commands: number;
      commandErrors: number;
      reconnects: number;
    };
  };
  cache: {
    redisHits: number;
    localHits: number;
    misses: number;
    writes: number;
    deletes: number;
    errors: number;
    singleFlightJoins: number;
    localEntries: number;
    inFlightLoads: number;
  };
};

export default function OperationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<{ data: Data }>("/api/v1/admin/console/operations")
      .then(response => setData(response.data))
      .catch(cause => setError((cause as Error).message));
  }, []);

  return (
    <>
      <PageHeader
        title="Operations"
        subtitle="Inspect active uploads, failed processing, quota cleanup and payment webhooks."
      />

      {error && <div className="alert alert-danger">{error}</div>}

      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="row g-3 mb-4">
            {[
              ["Active uploads", data.counts.activeUploads, "bi-cloud-arrow-up"],
              ["Failed assets", data.counts.failedAssets, "bi-file-earmark-x"],
              ["Variant queue/failures", data.counts.queuedOrFailedVariants, "bi-images"],
              ["Webhook failures", data.counts.webhookFailures, "bi-plug"],
              ["Usage email failures", data.counts.failedUsageEmails, "bi-envelope-exclamation"],
              ["PAYG charge failures", data.counts.failedPaygCharges, "bi-credit-card-2-back"]
            ].map(([label, value, icon]) => (
              <div className="col-sm-6 col-xl" key={String(label)}>
                <StatCard
                  icon={String(icon)}
                  label={String(label)}
                  value={String(value)}
                />
              </div>
            ))}
          </div>

          <div className="row g-4">
            <div className="col-12">
              <div className="card">
                <div className="card-header d-flex flex-wrap justify-content-between gap-2">
                  <strong>Redis performance layer</strong>
                  <span className={`badge ${
                    data.redis.status === "ready"
                      ? "text-bg-success"
                      : data.redis.status === "disabled"
                        ? "text-bg-secondary"
                        : "text-bg-danger"
                  }`}>
                    {data.redis.status}
                  </span>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-sm-6 col-xl-3">
                      <div className="small text-secondary">Redis cache hits</div>
                      <div className="fs-4 fw-semibold">{data.cache.redisHits}</div>
                    </div>
                    <div className="col-sm-6 col-xl-3">
                      <div className="small text-secondary">Local fallback hits</div>
                      <div className="fs-4 fw-semibold">{data.cache.localHits}</div>
                    </div>
                    <div className="col-sm-6 col-xl-3">
                      <div className="small text-secondary">Cache misses</div>
                      <div className="fs-4 fw-semibold">{data.cache.misses}</div>
                    </div>
                    <div className="col-sm-6 col-xl-3">
                      <div className="small text-secondary">Redis commands</div>
                      <div className="fs-4 fw-semibold">{data.redis.counters.commands}</div>
                    </div>
                  </div>
                  <div className="small text-secondary mt-3">
                    {data.redis.configured
                      ? data.redis.isReady
                        ? `Connected${data.redis.connectedAt ? ` since ${new Date(data.redis.connectedAt).toLocaleString()}` : ""}.`
                        : `Redis is configured but unavailable. ${data.redis.lastError ?? "Local fallbacks are active."}`
                      : "REDIS_URL is not configured. In-memory fallbacks are active."}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12">
              <div className="card">
                <div className="card-header"><strong>Active uploads</strong></div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr><th>File</th><th>Workspace</th><th>Status</th><th>Progress</th><th>Expires</th></tr>
                    </thead>
                    <tbody>
                      {data.uploads.length ? data.uploads.map(item => (
                        <tr key={item.id}>
                          <td>{item.mediaAsset.originalFilename}</td>
                          <td>{item.workspace.name}</td>
                          <td>{item.status}</td>
                          <td>{formatBytes(item.receivedBytes)} / {formatBytes(item.expectedBytes)} · {item.receivedChunks}/{item.expectedChunks}</td>
                          <td>{new Date(item.expiresAt).toLocaleString()}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={5} className="text-center text-secondary py-4">No active uploads</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="col-xl-6">
              <div className="card h-100">
                <div className="card-header"><strong>Failed assets</strong></div>
                <div className="list-group list-group-flush">
                  {data.failedAssets.length ? data.failedAssets.map(item => (
                    <div className="list-group-item" key={item.id}>
                      <strong>{item.originalFilename}</strong>
                      <div className="small text-secondary">
                        {item.workspace.name} · {formatBytes(item.sizeBytes)} · {new Date(item.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  )) : (
                    <div className="p-4 text-center text-secondary">No failed assets</div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-xl-6">
              <div className="card h-100">
                <div className="card-header"><strong>Payment webhook failures</strong></div>
                <div className="list-group list-group-flush">
                  {data.webhookFailures.length ? data.webhookFailures.map(item => (
                    <div className="list-group-item" key={item.id}>
                      <div className="d-flex justify-content-between">
                        <strong>{item.provider}</strong>
                        <span className="small text-secondary">{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="small font-monospace">{item.transactionId ?? "No transaction ID"}</div>
                      <div className="small text-danger">{item.processingError}</div>
                    </div>
                  )) : (
                    <div className="p-4 text-center text-secondary">No webhook failures</div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-12">
              <div className="card">
                <div className="card-header"><strong>PAYG card charge failures</strong></div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr><th>Workspace</th><th>Card</th><th>Amount</th><th>Status</th><th>Reason</th><th>Created</th></tr>
                    </thead>
                    <tbody>
                      {data.failedPaygCharges.length ? data.failedPaygCharges.map(item => (
                        <tr key={item.id}>
                          <td>{item.workspace.name}</td>
                          <td>{item.paymentMethod.provider} · {(item.paymentMethod.brand ?? "CARD").toUpperCase()} •••• {item.paymentMethod.last4 ?? "----"}</td>
                          <td>{new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency }).format(Number(item.amountMinor) / 100)}</td>
                          <td><span className="badge text-bg-danger">{item.status}</span></td>
                          <td className="text-danger">{item.failureReason ?? item.failureCode ?? "Unknown card error"}</td>
                          <td>{new Date(item.createdAt).toLocaleString()}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={6} className="text-center text-secondary py-4">No failed PAYG card charges</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="col-12">
              <div className="card">
                <div className="card-header"><strong>Usage alert email failures</strong></div>
                <div className="list-group list-group-flush">
                  {data.failedUsageEmails.length ? data.failedUsageEmails.map(item => (
                    <div className="list-group-item" key={item.id}>
                      <div className="d-flex flex-wrap justify-content-between gap-2">
                        <strong>{item.workspace.name} · {item.metric} · {item.threshold}%</strong>
                        <span className="small text-secondary">
                          {item.lastEmailAttemptAt ? new Date(item.lastEmailAttemptAt).toLocaleString() : "Not attempted"}
                        </span>
                      </div>
                      <div className="small text-secondary">{item.emailRecipient ?? "No recipient configured"}</div>
                      <div className="small text-danger">{item.emailLastError ?? "Unknown mail error"}</div>
                    </div>
                  )) : (
                    <div className="p-4 text-center text-secondary">No usage alert email failures</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
