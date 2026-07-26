export type DeliveryDisposition = "inline" | "attachment";

export type DeliveryAsset = {
  id: string;
  workspaceId: string;
  originalFilename: string;
  storageKey: string;
  contentType: string;
  detectedContentType: string | null;
};

export type ByteRange = {
  start: number;
  end: number;
};

export type DeliveryDescriptor = {
  asset: DeliveryAsset;
  fileSize: number;
  range: ByteRange | null;
  statusCode: 200 | 206;
  contentLength: number;
  contentRange?: string;
  disposition: DeliveryDisposition;
};
