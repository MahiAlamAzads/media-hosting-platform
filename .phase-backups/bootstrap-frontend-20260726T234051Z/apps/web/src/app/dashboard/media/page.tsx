"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

type Asset = {
  id: string;
  originalFilename: string;
  contentType: string;
  detectedMediaType: string;
  sizeBytes: string;
  status: string;
  createdAt: string;
};

type UploadState = {
  name: string;
  progress: number;
  status: "uploading" | "done" | "failed";
  message?: string;
};

function formatBytes(value: string | number): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

export default function MediaPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [error, setError] = useState("");

  async function loadAssets() {
    try {
      const payload = await apiRequest<{ data: Asset[] }>("/api/v1/media");
      setAssets(payload.data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load media.");
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  async function uploadFile(file: File) {
    const current: UploadState = {
      name: file.name,
      progress: 0,
      status: "uploading"
    };
    setUploads(previous => [current, ...previous]);

    try {
      const fileChecksum = await checksum(file);
      const initialized = await apiRequest<{
        data: {
          uploadId: string;
          chunkSizeBytes: number;
          expectedChunks: number;
        };
      }>("/api/v1/uploads", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksumSha256: fileChecksum
        })
      });

      const { uploadId, chunkSizeBytes, expectedChunks } = initialized.data;

      for (let index = 0; index < expectedChunks; index += 1) {
        const start = index * chunkSizeBytes;
        const end = Math.min(file.size, start + chunkSizeBytes);
        const chunk = file.slice(start, end);

        await apiRequest(`/api/v1/uploads/${uploadId}/chunks/${index}`, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          body: chunk
        });

        setUploads(previous =>
          previous.map(item =>
            item.name === file.name && item.status === "uploading"
              ? {
                  ...item,
                  progress: Math.round(((index + 1) / expectedChunks) * 100)
                }
              : item
          )
        );
      }

      await apiRequest(`/api/v1/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({})
      });

      setUploads(previous =>
        previous.map(item =>
          item.name === file.name && item.status === "uploading"
            ? { ...item, progress: 100, status: "done" }
            : item
        )
      );

      await loadAssets();
    } catch (uploadError) {
      setUploads(previous =>
        previous.map(item =>
          item.name === file.name && item.status === "uploading"
            ? {
                ...item,
                status: "failed",
                message:
                  uploadError instanceof Error
                    ? uploadError.message
                    : "Upload failed."
              }
            : item
        )
      );
    }
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    for (const file of files) {
      await uploadFile(file);
    }
    event.target.value = "";
  }

  const totalBytes = useMemo(
    () => assets.reduce((total, asset) => total + Number(asset.sizeBytes), 0),
    [assets]
  );

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <h1>Media Library</h1>
          <p className="muted">
            {assets.length} assets · {formatBytes(totalBytes)} stored locally
          </p>
        </div>
        <label className="primary upload-button">
          Upload media
          <input type="file" multiple hidden onChange={chooseFiles} />
        </label>
      </div>

      {error && <div className="notice error-notice">{error}</div>}

      {uploads.length > 0 && (
        <section className="upload-panel">
          <div className="panel-title">Upload activity</div>
          {uploads.map((upload, index) => (
            <div className="upload-row" key={`${upload.name}-${index}`}>
              <div>
                <strong>{upload.name}</strong>
                <div className="muted">
                  {upload.status === "failed"
                    ? upload.message
                    : upload.status === "done"
                      ? "Upload complete"
                      : `${upload.progress}% uploaded`}
                </div>
              </div>
              <div className="progress-track">
                <div
                  className="progress-value"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="media-table">
        <div className="media-table-head">
          <span>Name</span>
          <span>Type</span>
          <span>Size</span>
          <span>Status</span>
          <span>Created</span>
        </div>

        {assets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">↑</div>
            <h2>Upload your first asset</h2>
            <p className="muted">
              Files are stored on your configured SSD/HDD, not an external cloud.
            </p>
          </div>
        ) : (
          assets.map(asset => (
            <article className="media-row" key={asset.id}>
              <div className="asset-name">
                <div className="asset-icon">
                  {asset.detectedMediaType.slice(0, 1)}
                </div>
                <div>
                  <strong>{asset.originalFilename}</strong>
                  <div className="muted asset-id">{asset.id}</div>
                </div>
              </div>
              <span>{asset.detectedMediaType}</span>
              <span>{formatBytes(asset.sizeBytes)}</span>
              <span className={`status status-${asset.status.toLowerCase()}`}>
                {asset.status}
              </span>
              <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
            </article>
          ))
        )}
      </section>
    </section>
  );
}
