/**
 * Client API wrappers for the standalone UI Layout asset library.
 *
 * Uses apiFetch() which auto-injects Privy auth tokens.
 * Response shapes match server TypeBox models in
 * `server/models/world-studio.models.ts`
 * (UILayoutResponse / UILayoutDetailResponse).
 */

import type { UILayoutManifest } from "@hyperforge/ui-framework";

import { apiFetch } from "./api";

// ============== Response Types ==============

export interface UILayoutSummary {
  id: string;
  teamId: string;
  gameId: string | null;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  isTemplate: boolean;
  isPublic: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UILayoutDetail extends UILayoutSummary {
  manifestData: UILayoutManifest;
}

// ============== Request Types ==============

export interface CreateUILayoutRequest {
  name: string;
  description?: string;
  version?: string;
  gameId?: string;
  manifestData: UILayoutManifest;
  isTemplate?: boolean;
  isPublic?: boolean;
}

export interface UpdateUILayoutRequest {
  name?: string;
  description?: string;
  version?: string;
  manifestData?: UILayoutManifest;
  isTemplate?: boolean;
  isPublic?: boolean;
}

export interface CloneUILayoutRequest {
  name?: string;
  gameId?: string;
}

// ============== API Functions ==============

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

export async function listTeamUILayouts(
  teamId: string,
): Promise<UILayoutSummary[]> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts`,
  );
  return jsonOrThrow(res, "Failed to list UI layouts");
}

export async function listUILayoutTemplates(
  teamId: string,
): Promise<UILayoutSummary[]> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts/templates`,
  );
  return jsonOrThrow(res, "Failed to list UI layout templates");
}

export async function getUILayout(
  teamId: string,
  layoutId: string,
): Promise<UILayoutDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts/${encodeURIComponent(layoutId)}`,
  );
  return jsonOrThrow(res, "Failed to fetch UI layout");
}

export async function createUILayout(
  teamId: string,
  data: CreateUILayoutRequest,
): Promise<UILayoutDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return jsonOrThrow(res, "Failed to create UI layout");
}

export async function updateUILayout(
  teamId: string,
  layoutId: string,
  data: UpdateUILayoutRequest,
): Promise<UILayoutDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts/${encodeURIComponent(layoutId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return jsonOrThrow(res, "Failed to update UI layout");
}

export async function deleteUILayout(
  teamId: string,
  layoutId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts/${encodeURIComponent(layoutId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete UI layout: ${res.status}`);
}

export async function cloneUILayout(
  teamId: string,
  layoutId: string,
  data: CloneUILayoutRequest = {},
): Promise<UILayoutDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/ui-layouts/${encodeURIComponent(layoutId)}/clone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return jsonOrThrow(res, "Failed to clone UI layout");
}
