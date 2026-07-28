import { basename } from "node:path";
import { open, stat } from "node:fs/promises";

export class MediaPlatformError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = "MediaPlatformError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeVisibility(value) {
  return String(value).toUpperCase() === "PRIVATE"
    ? "PRIVATE"
    : "PUBLIC";
}

export class MediaPlatformClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.apiKey = apiKey;

    if (!this.baseUrl || !this.apiKey) {
      throw new Error(
        "MEDIA_PLATFORM_API_URL and MEDIA_PLATFORM_API_KEY are required."
      );
    }
  }

  async request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set(
      "Authorization",
      `Bearer ${this.apiKey}`
    );
    headers.set("Accept", "application/json");

    if (
      init.body &&
      !(init.body instanceof Uint8Array) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(
      `${this.baseUrl}${path}`,
      {
        ...init,
        headers
      }
    );

    if (!response.ok) {
      const payload =
        await response.json().catch(() => null);

      throw new MediaPlatformError(
        payload?.error?.message ??
          `Media Platform request failed with HTTP ${response.status}.`,
        response.status,
        payload?.error?.code ?? "HTTP_ERROR",
        payload?.error ?? payload
      );
    }

    if (response.status === 204) return null;
    return response.json();
  }

  createUpload({
    filename,
    contentType,
    sizeBytes,
    folderId = null,
    checksumSha256,
    visibility = "PUBLIC"
  }) {
    return this.request("/api/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        filename,
        contentType,
        sizeBytes,
        folderId,
        visibility:
          normalizeVisibility(visibility),
        ...(checksumSha256
          ? { checksumSha256 }
          : {})
      })
    });
  }

  async uploadFile(
    filePath,
    {
      contentType,
      folderId = null,
      checksumSha256,
      visibility = "PUBLIC"
    } = {}
  ) {
    if (!contentType) {
      throw new Error("contentType is required.");
    }

    const normalizedVisibility =
      normalizeVisibility(visibility);

    const fileInfo = await stat(filePath);
    const created = await this.createUpload({
      filename: basename(filePath),
      contentType,
      sizeBytes: fileInfo.size,
      folderId,
      checksumSha256,
      visibility: normalizedVisibility
    });

    const {
      uploadId,
      assetId,
      chunkSizeBytes,
      expectedChunks
    } = created.data;

    const handle = await open(filePath, "r");

    try {
      for (
        let chunkIndex = 0;
        chunkIndex < expectedChunks;
        chunkIndex += 1
      ) {
        const offset =
          chunkIndex * chunkSizeBytes;
        const length = Math.min(
          chunkSizeBytes,
          fileInfo.size - offset
        );
        const chunk =
          Buffer.allocUnsafe(length);

        const { bytesRead } =
          await handle.read(
            chunk,
            0,
            length,
            offset
          );

        if (bytesRead !== length) {
          throw new Error(
            `Expected ${length} bytes but read ${bytesRead}.`
          );
        }

        await this.request(
          `/api/v1/uploads/${uploadId}/chunks/${chunkIndex}`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/octet-stream",
              "Content-Length":
                String(chunk.byteLength)
            },
            body: chunk
          }
        );
      }
    } catch (error) {
      await this.request(
        `/api/v1/uploads/${uploadId}`,
        { method: "DELETE" }
      ).catch(() => null);

      throw error;
    } finally {
      await handle.close();
    }

    const completed = await this.request(
      `/api/v1/uploads/${uploadId}/complete`,
      {
        method: "POST",
        body: JSON.stringify(
          checksumSha256
            ? { checksumSha256 }
            : {}
        )
      }
    );

    return {
      uploadId,
      assetId,
      visibility: normalizedVisibility,
      ...completed.data
    };
  }

  listMedia({
    limit = 40,
    cursor,
    search,
    folderId,
    status
  } = {}) {
    const query = new URLSearchParams({
      limit: String(limit)
    });

    if (cursor) query.set("cursor", cursor);
    if (search) query.set("search", search);
    if (folderId) query.set("folderId", folderId);
    if (status) query.set("status", status);

    return this.request(`/api/v1/media?${query}`);
  }

  getMedia(assetId) {
    return this.request(
      `/api/v1/media/${encodeURIComponent(assetId)}`
    );
  }

  async createDeliveryUrl(
    assetId,
    disposition = "inline"
  ) {
    const payload = await this.request(
      `/api/v1/media/${encodeURIComponent(assetId)}/delivery-token`,
      {
        method: "POST",
        body: JSON.stringify({ disposition })
      }
    );

    return `${this.baseUrl}${payload.data.path}`;
  }

  setVisibility(assetId, visibility) {
    return this.request(
      `/api/v1/media/${encodeURIComponent(assetId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          visibility:
            normalizeVisibility(visibility)
        })
      }
    );
  }

  async makePublic(assetId) {
    const updated =
      await this.setVisibility(
        assetId,
        "PUBLIC"
      );

    return (
      updated.data.imgUrl ??
      updated.data.fileUrl
    );
  }

  makePrivate(assetId) {
    return this.setVisibility(
      assetId,
      "PRIVATE"
    );
  }
}
