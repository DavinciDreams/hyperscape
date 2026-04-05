/**
 * HLS CDN Sync — Watches the local HLS output directory and uploads
 * segments + playlists to an S3-compatible CDN (Cloudflare R2, AWS S3, etc.)
 *
 * Uses AWS Signature V4 over fetch — no @aws-sdk dependency required.
 *
 * Env vars:
 *   HLS_CDN_ENABLED            — "true" to enable CDN sync
 *   HLS_CDN_ENDPOINT           — S3 endpoint URL (e.g. https://<account>.r2.cloudflarestorage.com)
 *   HLS_CDN_BUCKET             — Bucket name
 *   HLS_CDN_ACCESS_KEY_ID      — Access key
 *   HLS_CDN_SECRET_ACCESS_KEY  — Secret key
 *   HLS_CDN_REGION             — Region (default: auto)
 *   HLS_CDN_PREFIX             — Key prefix in bucket (default: live/)
 *   HLS_CDN_PUBLIC_URL         — Public URL base for the CDN (e.g. https://stream.hyperscape.game)
 *   HLS_OUTPUT_PATH            — Local .m3u8 path (must match rtmp-bridge config)
 */

import { watch, type FSWatcher } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHmac, createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

// ============================================================================
// AWS Signature V4 (minimal, for S3 PUT only)
// ============================================================================

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function signS3PutRequest(params: {
  endpoint: string;
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}): { url: string; headers: Record<string, string> } {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const payloadHash = sha256Hex(params.body);

  const url = `${params.endpoint}/${params.bucket}/${params.key}`;
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname;

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    [
      `content-type:${params.contentType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join("\n") + "\n";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${params.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(
    params.secretAccessKey,
    dateStamp,
    params.region,
    "s3",
  );
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url,
    headers: {
      Authorization: authorization,
      "Content-Type": params.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Cache-Control": params.key.endsWith(".m3u8")
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=31536000, immutable",
    },
  };
}

// ============================================================================
// HLS CDN Syncer
// ============================================================================

interface HlsCdnConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  prefix: string;
  publicUrl: string | null;
  hlsDir: string;
}

function getConfig(): HlsCdnConfig | null {
  if (process.env.HLS_CDN_ENABLED !== "true") return null;

  const endpoint = process.env.HLS_CDN_ENDPOINT?.trim();
  const bucket = process.env.HLS_CDN_BUCKET?.trim();
  const accessKeyId = process.env.HLS_CDN_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.HLS_CDN_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.warn(
      "[HLS-CDN] Missing required env vars (HLS_CDN_ENDPOINT, HLS_CDN_BUCKET, HLS_CDN_ACCESS_KEY_ID, HLS_CDN_SECRET_ACCESS_KEY)",
    );
    return null;
  }

  const hlsOutputPath = process.env.HLS_OUTPUT_PATH?.trim();
  if (!hlsOutputPath) {
    console.warn(
      "[HLS-CDN] HLS_OUTPUT_PATH not set — cannot determine watch directory",
    );
    return null;
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.HLS_CDN_REGION?.trim() || "auto",
    prefix: process.env.HLS_CDN_PREFIX?.trim() || "live/",
    publicUrl: process.env.HLS_CDN_PUBLIC_URL?.trim() || null,
    hlsDir: dirname(hlsOutputPath),
  };
}

/** Track uploaded segment hashes to avoid redundant uploads */
const uploadedHashes = new Map<string, string>();
const MAX_TRACKED_FILES = 500;

/** Pending uploads (deduplication) */
const pendingUploads = new Set<string>();

let watcher: FSWatcher | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

async function uploadFile(
  config: HlsCdnConfig,
  filePath: string,
  fileName: string,
): Promise<void> {
  if (pendingUploads.has(fileName)) return;
  pendingUploads.add(fileName);

  try {
    const body = await readFile(filePath);
    const hash = sha256Hex(body);

    // Skip if unchanged (for .m3u8 which gets rewritten)
    if (uploadedHashes.get(fileName) === hash) {
      return;
    }

    const contentType = fileName.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : "video/MP2T";

    const key = `${config.prefix}${fileName}`;
    const { url, headers } = signS3PutRequest({
      endpoint: config.endpoint,
      bucket: config.bucket,
      key,
      body,
      contentType,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    });

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        `[HLS-CDN] Upload failed: ${fileName} → ${response.status} ${text.slice(0, 200)}`,
      );
      return;
    }

    uploadedHashes.set(fileName, hash);

    // Evict old entries
    if (uploadedHashes.size > MAX_TRACKED_FILES) {
      const keys = [...uploadedHashes.keys()];
      for (let i = 0; i < 100; i++) {
        uploadedHashes.delete(keys[i]);
      }
    }
  } catch (err) {
    console.error(
      `[HLS-CDN] Upload error: ${fileName}`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    pendingUploads.delete(fileName);
  }
}

async function syncDirectory(config: HlsCdnConfig): Promise<void> {
  try {
    const files = await readdir(config.hlsDir);
    const hlsFiles = files.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".m3u8"),
    );

    // Upload .ts segments first, then .m3u8 (so playlist references exist)
    const segments = hlsFiles.filter((f) => f.endsWith(".ts"));
    const playlists = hlsFiles.filter((f) => f.endsWith(".m3u8"));

    await Promise.all(
      segments.map((f) => uploadFile(config, join(config.hlsDir, f), f)),
    );
    await Promise.all(
      playlists.map((f) => uploadFile(config, join(config.hlsDir, f), f)),
    );
  } catch (err) {
    // Directory may not exist yet
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "[HLS-CDN] Sync error",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Start watching the HLS output directory and syncing to CDN.
 * Returns the public CDN URL for the stream, or null if not configured.
 */
export function startHlsCdnSync(): string | null {
  const config = getConfig();
  if (!config) {
    console.log("[HLS-CDN] CDN sync disabled");
    return null;
  }

  console.log(
    `[HLS-CDN] Starting CDN sync: ${config.hlsDir} → ${config.endpoint}/${config.bucket}/${config.prefix}`,
  );

  // Watch for file changes
  try {
    watcher = watch(
      config.hlsDir,
      { persistent: false },
      (eventType, filename) => {
        if (!filename) return;
        if (filename.endsWith(".ts") || filename.endsWith(".m3u8")) {
          void uploadFile(config, join(config.hlsDir, filename), filename);
        }
      },
    );
    watcher.on("error", (err) => {
      console.error("[HLS-CDN] Watcher error", err.message);
    });
  } catch {
    console.warn(
      "[HLS-CDN] Could not start watcher — falling back to polling only",
    );
  }

  // Also poll periodically as a safety net (watcher can miss events)
  syncInterval = setInterval(() => void syncDirectory(config), 2000);
  syncInterval.unref();

  // Initial sync
  void syncDirectory(config);

  const publicUrl = config.publicUrl
    ? `${config.publicUrl.replace(/\/$/, "")}/${config.prefix}stream.m3u8`
    : `${config.endpoint}/${config.bucket}/${config.prefix}stream.m3u8`;

  console.log(`[HLS-CDN] Public stream URL: ${publicUrl}`);
  return publicUrl;
}

/**
 * Stop the CDN sync watcher and interval.
 */
export function stopHlsCdnSync(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  uploadedHashes.clear();
  pendingUploads.clear();
  console.log("[HLS-CDN] CDN sync stopped");
}

/**
 * Get the configured CDN public URL for the stream, or the local fallback.
 */
export function getHlsStreamUrl(): string {
  const publicUrl = process.env.HLS_CDN_PUBLIC_URL?.trim();
  const prefix = process.env.HLS_CDN_PREFIX?.trim() || "live/";

  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${prefix}stream.m3u8`;
  }

  // Fall back to local /live/ path
  return "/live/stream.m3u8";
}
