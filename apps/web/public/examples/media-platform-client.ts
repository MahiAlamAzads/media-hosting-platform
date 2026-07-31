import { basename } from "node:path";
import { open, stat } from "node:fs/promises";

export type MediaVisibility = "PUBLIC" | "PRIVATE";

export type UploadResult = {
  uploadId: string;
  assetId: string;
  status: string;
  visibility: MediaVisibility;
  detectedContentType: string;
  detectedMediaType: string;
  checksumSha256: string;
  sizeBytes: string;
  isPublic: boolean;
  cdnPath: string | null;
  imgUrl: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
};

type ApiEnvelope<T> = {
  data: T;
  meta?: {
    requestId?: string;
  };
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    [key: string]: unknown;
  };
};

export class MediaPlatformError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = "MediaPlatformError";
  }
}

function normalizeVisibility(value: string): MediaVisibility {
  return value.toUpperCase() === "PRIVATE" ? "PRIVATE" : "PUBLIC";
}

export class MediaPlatformClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(input: { baseUrl: string; apiKey: string }) {
    this.baseUrl = String(input.baseUrl).replace(/\/$/, "");
    this.apiKey = input.apiKey;

    if (!this.baseUrl || !this.apiKey) {
      throw new Error(
        "MEDIA_PLATFORM_API_URL and MEDIA_PLATFORM_API_KEY are required.",
      );
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<ApiEnvelope<T>> {
    const headers = new Headers(init.headers);

    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Accept", "application/json");

    if (
      init.body &&
      !(init.body instanceof Uint8Array) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as ApiErrorPayload | null;

      throw new MediaPlatformError(
        payload?.error?.message ??
          `Media Platform request failed with HTTP ${response.status}.`,
        response.status,
        payload?.error?.code ?? "HTTP_ERROR",
        payload?.error ?? payload,
      );
    }

    return response.json() as Promise<ApiEnvelope<T>>;
  }

  async uploadFile(
    filePath: string,
    input: {
      contentType: string;
      visibility?: MediaVisibility;
      folderId?: string | null;
      checksumSha256?: string;
    },
  ): Promise<UploadResult> {
    const visibility = normalizeVisibility(input.visibility ?? "PUBLIC");

    const fileInfo = await stat(filePath);

    const created = await this.request<{
      uploadId: string;
      assetId: string;
      chunkSizeBytes: number;
      expectedChunks: number;
    }>("/api/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        filename: basename(filePath),
        contentType: input.contentType,
        sizeBytes: fileInfo.size,
        visibility,
        folderId: input.folderId ?? null,
        ...(input.checksumSha256
          ? {
              checksumSha256: input.checksumSha256,
            }
          : {}),
      }),
    });

    const { uploadId, assetId, chunkSizeBytes, expectedChunks } = created.data;

    const handle = await open(filePath, "r");

    try {
      for (let chunkIndex = 0; chunkIndex < expectedChunks; chunkIndex += 1) {
        const offset = chunkIndex * chunkSizeBytes;

        const length = Math.min(chunkSizeBytes, fileInfo.size - offset);

        const chunk = Buffer.allocUnsafe(length);

        const { bytesRead } = await handle.read(chunk, 0, length, offset);

        if (bytesRead !== length) {
          throw new Error(`Expected ${length} bytes but read ${bytesRead}.`);
        }

        await this.request<unknown>(
          `/api/v1/uploads/${uploadId}/chunks/${chunkIndex}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(chunk.byteLength),
            },
            body: chunk,
          },
        );
      }
    } catch (error) {
      await this.request<unknown>(`/api/v1/uploads/${uploadId}`, {
        method: "DELETE",
      }).catch(() => undefined);

      throw error;
    } finally {
      await handle.close();
    }

    const completed = await this.request<
      Omit<UploadResult, "uploadId" | "assetId">
    >(`/api/v1/uploads/${uploadId}/complete`, {
      method: "POST",
      body: JSON.stringify(
        input.checksumSha256
          ? {
              checksumSha256: input.checksumSha256,
            }
          : {},
      ),
    });

    return {
      uploadId,
      assetId,
      ...completed.data,
    };
  }

  async createDeliveryUrl(
    assetId: string,
    disposition: "inline" | "attachment" = "inline",
  ): Promise<string> {
    const payload = await this.request<{
      path: string;
    }>(`/api/v1/media/${encodeURIComponent(assetId)}/delivery-token`, {
      method: "POST",
      body: JSON.stringify({
        disposition,
      }),
    });

    return `${this.baseUrl}${payload.data.path}`;
  }

  setVisibility(assetId: string, visibility: MediaVisibility) {
    return this.request<UploadResult>(
      `/api/v1/media/${encodeURIComponent(assetId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          visibility,
        }),
      },
    );
  }
}
