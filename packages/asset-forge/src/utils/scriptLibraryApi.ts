/**
 * Client API wrappers for the standalone Script library.
 *
 * Uses apiFetch() which auto-injects Privy auth tokens.
 * Response shapes match server TypeBox models in
 * `server/models/world-studio.models.ts` (ScriptResponse / ScriptDetailResponse).
 */

import { apiFetch } from "./api";

// ============== Response Types ==============

export interface ScriptSummary {
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

export interface ScriptDetail extends ScriptSummary {
  graphData: unknown;
}

// ============== Request Types ==============

export interface CreateScriptRequest {
  name: string;
  description?: string;
  version?: string;
  gameId?: string;
  graphData: unknown;
  isTemplate?: boolean;
  isPublic?: boolean;
}

export interface UpdateScriptRequest {
  name?: string;
  description?: string;
  version?: string;
  graphData?: unknown;
  isTemplate?: boolean;
  isPublic?: boolean;
}

export interface CloneScriptRequest {
  name?: string;
  gameId?: string;
}

// ============== API Functions ==============

export async function listTeamScripts(
  teamId: string,
): Promise<ScriptSummary[]> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts`,
  );
  if (!res.ok) throw new Error(`Failed to list scripts: ${res.status}`);
  return res.json();
}

export async function listScriptTemplates(
  teamId: string,
): Promise<ScriptSummary[]> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts/templates`,
  );
  if (!res.ok) throw new Error(`Failed to list templates: ${res.status}`);
  return res.json();
}

export async function getScript(
  teamId: string,
  scriptId: string,
): Promise<ScriptDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts/${encodeURIComponent(scriptId)}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch script: ${res.status}`);
  return res.json();
}

export async function createScript(
  teamId: string,
  data: CreateScriptRequest,
): Promise<ScriptDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    let message = `Failed to create script: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body
    }
    throw new Error(message);
  }
  return res.json();
}

export async function updateScript(
  teamId: string,
  scriptId: string,
  data: UpdateScriptRequest,
): Promise<ScriptDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts/${encodeURIComponent(scriptId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    let message = `Failed to update script: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body
    }
    throw new Error(message);
  }
  return res.json();
}

export async function deleteScript(
  teamId: string,
  scriptId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts/${encodeURIComponent(scriptId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete script: ${res.status}`);
}

export async function cloneScript(
  teamId: string,
  scriptId: string,
  data: CloneScriptRequest = {},
): Promise<ScriptDetail> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/scripts/${encodeURIComponent(scriptId)}/clone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) throw new Error(`Failed to clone script: ${res.status}`);
  return res.json();
}
