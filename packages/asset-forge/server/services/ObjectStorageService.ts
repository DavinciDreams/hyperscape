import { Buffer } from "buffer";
import crypto from "crypto";
import fetch from "node-fetch";
import path from "path";

export interface StoredAsset {
  key: string;
  bucket: string;
  url: string;
  contentType?: string;
  bytes: number;
}

interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  prefix: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export class ObjectStorageService {
  private config?: ObjectStorageConfig;

  constructor() {
    const enabled = process.env.OBJECT_STORAGE_ENABLED === "true";
    if (!enabled) return;

    const endpoint =
      process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT || "";
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER || "";
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD || "";
    const bucket =
      process.env.S3_BUCKET_CONJURES ||
      process.env.MINIO_BUCKET_CONJURES ||
      "hyperscape-conjures";
    const publicBaseUrl =
      process.env.S3_PUBLIC_BASE_URL || process.env.MINIO_PUBLIC_BASE_URL || "";

    if (!endpoint || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      console.warn(
        "[ObjectStorageService] OBJECT_STORAGE_ENABLED=true but endpoint, credentials, or public base URL are missing; uploads are disabled",
      );
      return;
    }

    const region = process.env.S3_REGION || "us-east-1";
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== "false";
    const prefix = process.env.CONJURE_STORAGE_PREFIX || "conjures";

    this.config = {
      endpoint,
      region,
      forcePathStyle,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
      prefix: prefix.replace(/^\/+|\/+$/g, ""),
    };
  }

  get enabled(): boolean {
    return !!this.config;
  }

  buildConjureKey(
    assetId: string,
    fileName: string,
    options: { jobId?: string; prefix?: string } = {},
  ): string {
    const configPrefix = options.prefix ?? this.config?.prefix ?? "conjures";
    const safeAssetId = this.sanitizePathPart(assetId);
    const safeJobId = options.jobId ? this.sanitizePathPart(options.jobId) : "";
    const parsed = path.parse(fileName);
    const safeName = this.sanitizePathPart(parsed.name || "asset");
    const safeExt = parsed.ext.toLowerCase() || ".bin";
    return [configPrefix, safeAssetId, safeJobId, `${safeName}${safeExt}`]
      .filter(Boolean)
      .join("/");
  }

  async copyRemoteAsset(
    sourceUrl: string,
    key: string,
    contentType?: string,
  ): Promise<StoredAsset> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch asset for object storage: ${response.status} ${response.statusText}`,
      );
    }

    const body = Buffer.from(await response.arrayBuffer());
    const responseContentType = response.headers.get("content-type") || "";
    return this.uploadBuffer(
      key,
      body,
      contentType || responseContentType || this.contentTypeForKey(key),
    );
  }

  async uploadBuffer(
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<StoredAsset> {
    if (!this.config) {
      throw new Error("Object storage is not configured");
    }

    const resolvedContentType = contentType || this.contentTypeForKey(key);
    const signedRequest = this.signPutRequest(key, body, resolvedContentType);
    const response = await fetch(signedRequest.url, {
      method: "PUT",
      headers: signedRequest.headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Object storage upload failed: ${response.status} ${response.statusText} ${errorText}`,
      );
    }

    return {
      key,
      bucket: this.config.bucket,
      url: `${this.config.publicBaseUrl}/${encodeURI(key)}`,
      contentType: resolvedContentType,
      bytes: body.byteLength,
    };
  }

  private signPutRequest(
    key: string,
    body: Buffer,
    contentType: string,
  ): { url: string; headers: Record<string, string> } {
    if (!this.config) {
      throw new Error("Object storage is not configured");
    }

    const endpoint = new URL(this.config.endpoint);
    const encodedKey = this.encodePath(key);
    const canonicalUri = this.config.forcePathStyle
      ? `/${this.config.bucket}/${encodedKey}`
      : `/${encodedKey}`;
    const host = this.config.forcePathStyle
      ? endpoint.host
      : `${this.config.bucket}.${endpoint.host}`;
    const url = `${endpoint.protocol}//${host}${canonicalUri}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256Hex(body);
    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join("\n");
    const signature = this.hmacHex(this.signingKey(dateStamp), stringToSign);
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url,
      headers: {
        Authorization: authorization,
        "Content-Type": contentType,
        Host: host,
        "X-Amz-Content-Sha256": payloadHash,
        "X-Amz-Date": amzDate,
      },
    };
  }

  private contentTypeForKey(key: string): string {
    return (
      CONTENT_TYPES[path.extname(key).toLowerCase()] ||
      "application/octet-stream"
    );
  }

  private sanitizePathPart(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96);
  }

  private encodePath(value: string): string {
    return value
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  private sha256Hex(value: Buffer | string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private hmac(key: Buffer | string, value: string): Buffer {
    return crypto.createHmac("sha256", key).update(value).digest();
  }

  private hmacHex(key: Buffer | string, value: string): string {
    return crypto.createHmac("sha256", key).update(value).digest("hex");
  }

  private signingKey(dateStamp: string): Buffer {
    if (!this.config) {
      throw new Error("Object storage is not configured");
    }

    const dateKey = this.hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const regionKey = this.hmac(dateKey, this.config.region);
    const serviceKey = this.hmac(regionKey, "s3");
    return this.hmac(serviceKey, "aws4_request");
  }
}
