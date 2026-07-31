"use client";

import { type ChangeEvent, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback } from "@/components/feedback";
import { apiRequest, API_URL, getAccessToken } from "@/lib/api";

const formatBytes = (value: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;

  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }

  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverChunkSize, setServerChunkSize] = useState<number | null>(null);
  const [publicUpload, setPublicUpload] = useState(true);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  async function upload(): Promise<void> {
    if (!file) return;

    setBusy(true);
    setMessage("");
    setUploadedUrl(null);

    try {
      const init = await apiRequest<{
        data: {
          uploadId: string;
          chunkSizeBytes: number;
        };
      }>("/api/v1/uploads", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          visibility: publicUpload ? "PUBLIC" : "PRIVATE",
        }),
      });

      const { uploadId, chunkSizeBytes } = init.data;
      setServerChunkSize(chunkSizeBytes);
      const chunks = Math.ceil(file.size / chunkSizeBytes);

      for (let index = 0; index < chunks; index += 1) {
        const start = index * chunkSizeBytes;
        const body = file.slice(
          start,
          Math.min(file.size, start + chunkSizeBytes),
        );
        const token = getAccessToken();
        const response = await fetch(
          `${API_URL}/api/v1/uploads/${uploadId}/chunks/${index}`,
          {
            method: "PUT",
            headers: {
              ...(token ? { authorization: `Bearer ${token}` } : {}),
              "content-type": "application/octet-stream",
            },
            credentials: "include",
            body,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.error?.message ?? `Chunk ${index + 1} failed.`,
          );
        }

        setProgress(Math.round(((index + 1) / chunks) * 90));
      }

      const completed = await apiRequest<{
        data: {
          assetId: string;
          visibility: "PRIVATE" | "PUBLIC";
          imgUrl: string | null;
          fileUrl: string | null;
          optimization: {
            status: "QUEUED" | "DISABLED" | "NOT_APPLICABLE";
            outputFormat: "webp" | "avif" | null;
            variants: readonly string[];
          };
        };
      }>(`/api/v1/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const publicUrl = completed.data.imgUrl ?? completed.data.fileUrl;
      setProgress(100);
      setUploadedUrl(publicUrl);
      const isOptimizing = completed.data.optimization.status === "QUEUED";
      setMessage(
        isOptimizing
          ? `Upload completed. ${completed.data.optimization.outputFormat?.toUpperCase()} preview and thumbnail are being generated automatically.`
          : publicUrl
            ? "Upload completed. Your public CDN URL is ready."
            : "Upload completed successfully. This file is private.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Upload media"
        subtitle="Plan-aware resumable upload with atomic quota reservation."
      >
        <a
          className="btn btn-outline-secondary"
          href="/dashboard/billing/usage"
        >
          View limits
        </a>
      </PageHeader>

      {message && (
        <Feedback
          message={message}
          variant={progress === 100 ? "success" : "danger"}
        />
      )}

      <div className="row justify-content-center">
        <div className="col-xl-8">
          <div className="card">
            <div className="card-body p-4 p-lg-5 text-center">
              <i className="bi bi-cloud-arrow-up display-4 text-primary" />
              <h2 className="h5 mt-3">Choose a file</h2>
              <p className="text-secondary">
                The API validates file size, storage, monthly upload bandwidth
                and active-asset limits before reserving quota.
              </p>

              <input
                className="form-control"
                type="file"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setFile(event.target.files?.[0] ?? null);
                  setProgress(0);
                  setServerChunkSize(null);
                  setUploadedUrl(null);
                  setMessage("");
                }}
              />

              {file && (
                <div className="border rounded p-3 mt-3 text-start">
                  <strong>{file.name}</strong>
                  <div className="text-secondary small">
                    {formatBytes(file.size)} · {file.type || "Unknown type"}
                  </div>
                  <div className="text-secondary small mt-1">
                    {serverChunkSize
                      ? `Server chunk size: ${formatBytes(serverChunkSize)}`
                      : "Chunk size will be supplied by the server."}
                  </div>
                </div>
              )}

              <div className="form-check form-switch text-start mt-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="publicUpload"
                  checked={publicUpload}
                  onChange={(event) => setPublicUpload(event.target.checked)}
                />
                <label className="form-check-label" htmlFor="publicUpload">
                  Create a public CDN URL
                </label>
                <div className="form-text">
                  Public uploads can be embedded directly with an HTML
                  <code className="ms-1">&lt;img&gt;</code> tag.
                </div>
              </div>

              {(busy || progress > 0) && (
                <div
                  className="progress mt-3"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%` }}
                  >
                    {progress}%
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary mt-3 px-4"
                disabled={!file || busy}
                onClick={upload}
              >
                {busy ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Uploading…
                  </>
                ) : (
                  "Start upload"
                )}
              </button>

              {uploadedUrl && (
                <div className="text-start mt-4">
                  <label
                    className="form-label fw-semibold"
                    htmlFor="uploadedImgUrl"
                  >
                    CDN URL
                  </label>
                  <div className="input-group">
                    <input
                      id="uploadedImgUrl"
                      className="form-control font-monospace"
                      value={uploadedUrl}
                      readOnly
                    />
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() =>
                        void navigator.clipboard.writeText(uploadedUrl)
                      }
                    >
                      <i className="bi bi-copy me-1" />
                      Copy
                    </button>
                  </div>
                  {file?.type.startsWith("image/") && (
                    <div className="form-text">
                      HTML: <code>{`<img src="${uploadedUrl}" alt="" />`}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
