/**
 * Client API wrappers for the Phase I5 plugin community registry.
 *
 * Surfaces the two GET endpoints from
 * `packages/asset-forge/server/routes/plugins.ts`:
 *
 *   GET /api/plugins/registry            — list all published
 *   GET /api/plugins/registry/:id/:ver   — fetch a single bundle
 *
 * Both routes are public (no auth required by the current server
 * implementation) but we still go through `apiFetch` so deployments
 * that add auth later pick it up for free.
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";

import { apiFetch } from "./api";

/**
 * One entry in the registry list response. Mirrors the server's
 * `/plugins/registry` GET handler return shape.
 */
export interface PluginRegistryListEntry {
  registryId: string;
  id: string;
  version: string;
  publishedAt: string;
  url: string;
}

export interface PluginRegistryListResponse {
  ok: true;
  count: number;
  entries: PluginRegistryListEntry[];
}

/**
 * Full bundle response from `/plugins/registry/:id/:version`. The
 * `bundle` field is whatever the publisher POSTed — we know it has
 * `manifest` but everything else is free-form (dist files, metadata).
 */
export interface PluginRegistryDetailResponse {
  ok: true;
  registryId: string;
  id: string;
  version: string;
  publishedAt: string;
  bundle: {
    manifest: PluginManifest;
    [key: string]: unknown;
  };
}

async function jsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (!res.ok) {
    let message = `${fallbackMsg}: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // no JSON body
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch the list of all published plugin bundles, newest-first.
 */
export async function listPublishedPlugins(): Promise<
  PluginRegistryListEntry[]
> {
  const res = await apiFetch("/api/plugins/registry");
  const body = await jsonOrThrow<PluginRegistryListResponse>(
    res,
    "Failed to list published plugins",
  );
  return body.entries;
}

/**
 * Fetch a single bundle's full descriptor by id + version.
 */
export async function getPublishedPlugin(
  id: string,
  version: string,
): Promise<PluginRegistryDetailResponse> {
  const res = await apiFetch(
    `/api/plugins/registry/${encodeURIComponent(id)}/${encodeURIComponent(version)}`,
  );
  return jsonOrThrow(res, `Failed to fetch plugin ${id}@${version}`);
}

/** One file entry in a plugin bundle's `files` array. */
export interface PluginBundleFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * Result of a single content-store fetch + sha256 verification.
 * `bytes` is the raw file payload; the caller decides what to do
 * with it (write to IndexedDB, mount into a virtual fs, etc.).
 */
export interface InstalledPluginFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

/**
 * Fetch + sha256-verify a single content-store entry. Throws if the
 * content store returns a different hash than requested or if the
 * bytes don't match the claimed sha256.
 *
 * Browser sha256 uses `crypto.subtle.digest('SHA-256', ...)` which
 * is available in every modern browser and Node 18+.
 */
async function fetchContentVerified(sha256: string): Promise<Uint8Array> {
  const res = await apiFetch(
    `/api/plugins/content/${encodeURIComponent(sha256)}`,
  );
  if (!res.ok) {
    throw new Error(`Content fetch failed for ${sha256}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hex !== sha256) {
    throw new Error(
      `sha256 mismatch for content ${sha256}: server returned ${hex}`,
    );
  }
  return bytes;
}

/**
 * Result of an end-to-end install of a single plugin bundle.
 *
 * Pulls the bundle descriptor + every referenced file from the
 * content store, sha-verifies each file, and returns the verified
 * bytes plus the bundle metadata. Caller is responsible for
 * persistence (IndexedDB, in-memory cache, etc.).
 *
 * Throws on any sha mismatch or 404 to avoid partial installs.
 */
export interface InstalledPlugin {
  readonly registryId: string;
  readonly id: string;
  readonly version: string;
  readonly publishedAt: string;
  readonly bundle: PluginRegistryDetailResponse["bundle"];
  readonly files: InstalledPluginFile[];
  /** Total bytes downloaded from the content store. */
  readonly totalSize: number;
}

/**
 * End-to-end install: descriptor → all referenced files → verified
 * bytes. Idempotent at the network layer (content store dedup) but
 * the caller's persistence layer decides whether re-install replaces
 * or augments existing state.
 *
 * Progress callback fires after each file completes, useful for the
 * UI to render a per-file progress list.
 */
export async function installPlugin(
  id: string,
  version: string,
  onFileComplete?: (
    file: InstalledPluginFile,
    index: number,
    total: number,
  ) => void,
): Promise<InstalledPlugin> {
  const detail = await getPublishedPlugin(id, version);
  const bundle = detail.bundle as {
    manifest: PluginManifest;
    files?: PluginBundleFile[];
  };
  const fileList = Array.isArray(bundle.files) ? bundle.files : [];

  const files: InstalledPluginFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const meta = fileList[i];
    const bytes = await fetchContentVerified(meta.sha256);
    if (bytes.length !== meta.size) {
      throw new Error(
        `size mismatch for ${meta.path} (sha=${meta.sha256}): expected ${meta.size}, got ${bytes.length}`,
      );
    }
    const installed: InstalledPluginFile = {
      path: meta.path,
      size: meta.size,
      sha256: meta.sha256,
      bytes,
    };
    files.push(installed);
    onFileComplete?.(installed, i + 1, fileList.length);
  }

  return {
    registryId: detail.registryId,
    id: detail.id,
    version: detail.version,
    publishedAt: detail.publishedAt,
    bundle: detail.bundle,
    files,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
  };
}
