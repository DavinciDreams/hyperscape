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
