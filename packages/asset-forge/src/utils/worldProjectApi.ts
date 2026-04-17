/**
 * Client API wrappers for World Studio project endpoints.
 *
 * Uses apiFetch() which auto-injects Privy auth tokens.
 * Response shapes match server TypeBox models in server/models/world-studio.models.ts.
 */

import { apiFetch } from "./api";

// ============== Response Types ==============

export interface AuthTeamMembership {
  teamId: string;
  teamName: string;
  role: string;
}

export interface AuthMeResponse {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  teams: AuthTeamMembership[];
}

export interface GameModeManifestResponse {
  playerController: string;
  camera: string;
  inputContext: string;
  pawn: string;
}

export interface GameResponse {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string | null;
  moduleId: string;
  gameMode: GameModeManifestResponse;
  stagingServerUrl: string | null;
  productionServerUrl: string | null;
  createdAt: string;
}

export interface WorldProjectSummary {
  id: string;
  teamId: string;
  gameId: string;
  name: string;
  description: string | null;
  version: number;
  createdBy: string;
  lockedBy: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorldProjectDetail extends WorldProjectSummary {
  worldData: unknown;
  manifestSnapshot: unknown;
}

export interface LockResult {
  success: boolean;
  lockedBy?: string;
}

// ============== API Functions ==============

export async function fetchCurrentUser(): Promise<AuthMeResponse> {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`);
  return res.json();
}

export async function fetchTeamGames(teamId: string): Promise<GameResponse[]> {
  const res = await apiFetch(`/api/teams/${teamId}/games`);
  if (!res.ok) throw new Error(`Failed to fetch games: ${res.status}`);
  return res.json();
}

export async function fetchGame(
  teamId: string,
  gameId: string,
): Promise<GameResponse> {
  const res = await apiFetch(`/api/teams/${teamId}/games/${gameId}`);
  if (!res.ok) throw new Error(`Failed to fetch game: ${res.status}`);
  return res.json();
}

/**
 * Partial update for a game record. `gameMode` is validated server-side
 * against the allowlist in `asset-forge/server/utils/gameModeRegistry.ts`.
 */
export async function updateGame(
  teamId: string,
  gameId: string,
  patch: {
    name?: string;
    description?: string;
    gameMode?: GameModeManifestResponse;
  },
): Promise<GameResponse> {
  const res = await apiFetch(`/api/teams/${teamId}/games/${gameId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Failed to update game: ${res.status} ${msg}`);
  }
  return res.json();
}

export async function listWorldProjects(
  teamId: string,
  gameId: string,
): Promise<WorldProjectSummary[]> {
  const res = await apiFetch(
    `/api/world/projects?teamId=${encodeURIComponent(teamId)}&gameId=${encodeURIComponent(gameId)}`,
  );
  if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
  return res.json();
}

export async function getWorldProject(
  projectId: string,
): Promise<WorldProjectDetail> {
  const res = await apiFetch(`/api/world/projects/${projectId}`);
  if (!res.ok) throw new Error(`Failed to fetch project: ${res.status}`);
  return res.json();
}

export async function createWorldProject(data: {
  teamId: string;
  gameId: string;
  name: string;
  description?: string;
  worldData: unknown;
}): Promise<WorldProjectDetail> {
  const res = await apiFetch("/api/world/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
  return res.json();
}

export async function saveWorldProject(
  projectId: string,
  data: { worldData: unknown; manifestSnapshot?: unknown },
): Promise<WorldProjectDetail> {
  const res = await apiFetch(`/api/world/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save project: ${res.status}`);
  return res.json();
}

export async function deleteWorldProject(projectId: string): Promise<void> {
  const res = await apiFetch(`/api/world/projects/${projectId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete project: ${res.status}`);
}

export async function acquireProjectLock(
  projectId: string,
): Promise<LockResult> {
  const res = await apiFetch(`/api/world/projects/${projectId}/lock`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to acquire lock: ${res.status}`);
  return res.json();
}

export async function releaseProjectLock(projectId: string): Promise<void> {
  const res = await apiFetch(`/api/world/projects/${projectId}/unlock`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to release lock: ${res.status}`);
}
